import { VWAP_EXACT_SOURCES } from '../domain/vwap-exact';
import { VWAP_ANCHORS, VWAP_WORKER_LIMITS as LIMIT, type VwapCalculationSettings, type VwapDiagnostic, type VwapPlot, type VwapPlotId, type VwapWireRequest } from './types';

export class VwapError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'VwapError'; } }
export function reject(code: string, message: string): never { throw new VwapError(code, message); }
export function errorText(cause: unknown): string {
  if (typeof cause === 'string') return cause.slice(0, LIMIT.errorCharacters);
  if (cause !== null && typeof cause === 'object') try { const d = Object.getOwnPropertyDescriptor(cause, 'message'); if (d && 'value' in d && typeof d.value === 'string') return d.value.slice(0, LIMIT.errorCharacters); } catch { /* Hostile thrown values grant no inspection authority. */ }
  return 'The VWAP operation failed without an inspectable message.';
}
export function ownData(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject('VWAP_DATA', `${label} must be plain own data.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some(key => typeof key !== 'string' || !expected.includes(key))) reject('VWAP_DATA', `${label} has unsupported or missing fields.`);
  const output: Record<string, unknown> = Object.create(null);
  for (const key of expected) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) reject('VWAP_DATA', `${label}.${key} must be enumerable data.`); output[key] = descriptor.value; }
  return output;
}
export function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) reject('VWAP_DATA', `${label} is outside its integer bound.`);
  return value;
}
export function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.length || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) reject('VWAP_DATA', `${label} is not bounded text.`);
  return value;
}
const settingsKeys = ['kernelVersion', 'source', 'anchor', 'timezone', 'transform', 'bandMode', 'band1Enabled', 'band1Multiplier', 'band2Enabled', 'band2Multiplier', 'band3Enabled', 'band3Multiplier'] as const;
export function copyVwapSettings(value: unknown): Readonly<VwapCalculationSettings> {
  const fields = ownData(value, settingsKeys, 'VWAP settings');
  if (fields.kernelVersion !== 2 || !(VWAP_EXACT_SOURCES as readonly unknown[]).includes(fields.source) || !(VWAP_ANCHORS as readonly unknown[]).includes(fields.anchor) || !['standard', 'heikin-ashi'].includes(fields.transform as string) || !['Percentage', 'Standard Deviation'].includes(fields.bandMode as string)) reject('VWAP_SETTINGS', 'Unsupported VWAP version, source, anchor, transform or band mode.');
  const timezone = text(fields.timezone, 128, 'VWAP timezone');
  try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); } catch { reject('VWAP_SETTINGS', 'VWAP timezone is unavailable.'); }
  for (let pair = 1; pair <= 3; pair++) {
    const enabled = fields[`band${pair}Enabled`], multiplier = fields[`band${pair}Multiplier`];
    if (typeof enabled !== 'boolean' || typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 100_000) reject('VWAP_SETTINGS', 'Every VWAP band requires a boolean and finite multiplier from 0 through 100000.');
  }
  return Object.freeze({ ...fields }) as unknown as Readonly<VwapCalculationSettings>;
}
export function vwapPlots(settings: VwapCalculationSettings): readonly VwapPlot[] {
  const plots: VwapPlot[] = [{ id: 'vwap', label: 'VWAP' }];
  for (let pair = 1; pair <= 3; pair++) if (settings[`band${pair}Enabled` as keyof VwapCalculationSettings]) plots.push({ id: `upper${pair}` as VwapPlotId, label: `Upper Band ${pair}` }, { id: `lower${pair}` as VwapPlotId, label: `Lower Band ${pair}` });
  return Object.freeze(plots.map(plot => Object.freeze(plot)));
}
export const VWAP_EXACT_POLICIES = Object.freeze([
  'OpenCandle kernel 2 uses exact weighted accumulation and binary64 ties-to-even; source averages round before weighting. Reference rounding is unverified.',
  'Calendar anchors use the declared timezone. Missing or negative volume makes the complete prefix unavailable; zero volume retains the same-anchor value.',
  'Percentage and Standard Deviation bands are available; Standard Deviation uses the volume-weighted deviation of the binary64 source around the anchored VWAP. A band overflow remains a gap without deleting earlier values.'
]);
const byteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const resizableGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
export function exactBuffer(value: unknown, length: number, label: string): ArrayBuffer {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length) reject('VWAP_BUFFER', `${label} must be an ordinary owned ArrayBuffer.`);
  try {
    if (byteLengthGetter.call(value) !== length || (resizableGetter && resizableGetter.call(value))) reject('VWAP_BUFFER', `${label} has the wrong length or is resizable.`);
    // Also rejects a detached zero-length buffer on engines where byteLength alone is ambiguous.
    new Uint8Array(value as ArrayBuffer, 0, 0);
  } catch (cause) { if (cause instanceof VwapError) throw cause; reject('VWAP_BUFFER', `${label} is detached or unavailable.`); }
  return value as ArrayBuffer;
}
export function ownList(value: unknown, maximum: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) reject('VWAP_DATA', `${label} must be an ordinary array.`);
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || !('value' in length)) reject('VWAP_DATA', `${label} has no data length.`);
  const count = integer(length.value, 0, maximum, `${label} length`), keys = Reflect.ownKeys(value);
  if (keys.length !== count + 1) reject('VWAP_DATA', `${label} must be dense without extra fields.`);
  const copy: unknown[] = [];
  for (let index = 0; index < count; index++) { const d = Object.getOwnPropertyDescriptor(value, String(index)); if (!d || !d.enumerable || !('value' in d)) reject('VWAP_DATA', `${label} contains an accessor or sparse entry.`); copy.push(d.value); }
  return copy;
}
export function copyDiagnostics(value: unknown, plots: readonly VwapPlot[]): readonly VwapDiagnostic[] {
  const allowed = new Set(plots.map(plot => plot.id)), used = new Set<string>();
  return Object.freeze(ownList(value, 6, 'VWAP diagnostics').map(row => {
    const data = ownData(row, ['plotId', 'message'], 'VWAP diagnostic'), id = text(data.plotId, 8, 'Diagnostic plot');
    if (!allowed.has(id as VwapPlotId) || id === 'vwap' || used.has(id)) reject('VWAP_DATA', 'VWAP diagnostic has an inactive or duplicate plot.');
    used.add(id); return Object.freeze({ plotId: id as VwapPlotId, message: text(data.message, 384, 'Diagnostic message') });
  }));
}
export function copyWireRequest(value: unknown): VwapWireRequest {
  const data = ownData(value, ['v', 'type', 'job', 'rows', 'settings', 'buffer'], 'VWAP request');
  if (data.v !== 1 || data.type !== 'calculate') reject('VWAP_PROTOCOL', 'Unsupported VWAP protocol.');
  const rows = integer(data.rows, 1, LIMIT.rows, 'VWAP rows'), settings = copyVwapSettings(data.settings), job = text(data.job, 96, 'VWAP job');
  return { v: 1, type: 'calculate', job, rows, settings, buffer: exactBuffer(data.buffer, rows * 6 * 8, 'VWAP input') };
}
