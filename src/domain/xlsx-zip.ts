// Shared Office Open XML helpers: CRC-32, a minimal ZIP writer (stored or deflated entries) and SpreadsheetML text
// escaping. Used by the strategy report workbook and the all-indicators workbook.
const encoder = new TextEncoder();
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
/** Running CRC-32: start from 0xFFFFFFFF, feed chunks, finish with crc32Finish. */
export function crc32Update(crc: number, bytes: Uint8Array): number { for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); return crc; }
export const crc32Finish = (crc: number) => (crc ^ 0xFFFFFFFF) >>> 0;
export function crc32(bytes: Uint8Array): number { return crc32Finish(crc32Update(0xFFFFFFFF, bytes)); }
/** One ZIP entry. `data` is the stored bytes (method 0) or the raw deflate stream (method 8) of `size` original bytes. */
export interface ZipEntry { name: string; data: Uint8Array; crc: number; size: number; method: 0 | 8 }
/** Minimal ZIP writer. Fixed DOS timestamp 1980-01-01 keeps output deterministic. */
export function zipArchive(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = []; let offset = 0;
  for (const file of entries) {
    const name = encoder.encode(file.name), { crc, size, method } = file, packed = file.data.length;
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, packed, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, packed, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    locals.push(local, file.data); centrals.push(central); offset += local.length + packed;
  }
  const centralSize = centrals.reduce((sum, row) => sum + row.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22); let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
}
/** Stored (method 0) archive of whole files. */
export function storedZip(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  return zipArchive(files.map(file => ({ name: file.name, data: file.data, crc: crc32(file.data), size: file.data.length, method: 0 })));
}
/** True when the platform deflate (CompressionStream 'deflate-raw', Chromium and Node) is present. */
export function deflateAvailable(): boolean { try { return typeof CompressionStream === 'function' && !!new CompressionStream('deflate-raw' as CompressionFormat); } catch { return false; } }
/**
 * A ZIP entry from text produced in chunks: each chunk is encoded, counted into the CRC and fed to the platform
 * deflate as it arrives, so the whole uncompressed part never has to exist at once. Falls back to stored without deflate.
 */
export async function textZipEntry(name: string, chunks: Iterable<string>, deflate = deflateAvailable()): Promise<ZipEntry> {
  let crc = 0xFFFFFFFF, size = 0;
  if (!deflate) { const parts: Uint8Array[] = []; for (const chunk of chunks) { const bytes = encoder.encode(chunk); crc = crc32Update(crc, bytes); size += bytes.length; parts.push(bytes); } const data = new Uint8Array(size); let at = 0; for (const part of parts) { data.set(part, at); at += part.length; } return { name, data, crc: crc32Finish(crc), size, method: 0 }; }
  const stream = new CompressionStream('deflate-raw' as CompressionFormat), writer = stream.writable.getWriter(), packed = new Response(stream.readable).arrayBuffer();
  try { for (const chunk of chunks) { const bytes = encoder.encode(chunk); crc = crc32Update(crc, bytes); size += bytes.length; await writer.write(bytes); } await writer.close(); }
  catch (error) { try { await writer.abort(error); } catch { /* the original failure is reported */ } packed.catch(() => undefined); throw error; }
  return { name, data: new Uint8Array(await packed), crc: crc32Finish(crc), size, method: 8 };
}
/** XML text with characters that are invalid in XML 1.0 removed and the five markup characters escaped. */
export const xmlText = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** Spreadsheet column letters for a zero-based index (0 = A, 26 = AA). */
export function columnName(index: number) { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; }
/** Text that a spreadsheet would read as a formula gets the leading apostrophe the CSV exports use. */
export const formulaSafeText = (value: string) => /^[\s﻿]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
