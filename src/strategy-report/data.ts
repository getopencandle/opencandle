import { REPORT_WORKER_LIMITS } from './types';

export class ReportWorkerError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'ReportWorkerError'; }
}
export function reject(code: string, message: string): never { throw new ReportWorkerError(code, message); }
/** `maxFields` lets the metric records (one field per catalog metric) exceed the default 64-field bound. */
export function ownRecord(value: unknown, label: string, keys?: readonly string[], maxFields = 64): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject('REPORT_TRANSPORT_RECORD', `${label} must be a plain data record.`);
  const names = Reflect.ownKeys(value as object);
  if (names.length > maxFields) reject('REPORT_TRANSPORT_FIELDS', `${label} exceeds the field limit.`);
  for (const name of names) {
    if (typeof name !== 'string' || ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(name) || keys && !keys.includes(name)) reject('REPORT_TRANSPORT_FIELDS', `${label} contains an unsupported field.`);
    const field = Object.getOwnPropertyDescriptor(value, name)!;
    if (!field.enumerable || !('value' in field)) reject('REPORT_TRANSPORT_ACCESSOR', `${label} requires enumerable data properties.`);
  }
}
export function ownArray(value: unknown, label: string, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) reject('REPORT_TRANSPORT_ARRAY', `${label} exceeds its plain-array bound.`);
  const names = Reflect.ownKeys(value as object), length = (value as unknown[]).length;
  if (names.length !== length + 1 || names.some(name => name !== 'length' && (typeof name !== 'string' || !/^(0|[1-9]\d*)$/.test(name) || Number(name) >= length))) reject('REPORT_TRANSPORT_ARRAY', `${label} must be a dense plain array without extra properties.`);
}
export function ownAt<T>(values: readonly T[], index: number): T {
  const field = Object.getOwnPropertyDescriptor(values, String(index));
  if (!field || !field.enumerable || !('value' in field)) reject('REPORT_TRANSPORT_ACCESSOR', 'Array rows must be own enumerable data values.');
  return field!.value as T;
}
export function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) reject('REPORT_TRANSPORT_INTEGER', `${label} is outside its integer bounds.`);
  return value as number;
}
export function boundedText(value: unknown, label: string, maximum: number, empty = false): string {
  if (typeof value !== 'string' || value.length > maximum || !empty && !value.length) reject('REPORT_TRANSPORT_TEXT', `${label} is not bounded text.`);
  return value as string;
}
/** Clone descriptor values only. No unchecked object reaches structured serialization. */
export function copyWire<T>(value: T, maximumBytes: number): { value: T; bytes: number } {
  let nodes = 0, rawBytes = 0;
  const active = new WeakSet<object>(), encoder = new TextEncoder();
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > REPORT_WORKER_LIMITS.messageNodes || depth > REPORT_WORKER_LIMITS.messageDepth) reject('REPORT_TRANSPORT_WORK', 'Message validation exceeds its work or depth bound.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) reject('REPORT_TRANSPORT_NUMBER', 'Transport numbers must be finite.'); return item; }
    if (typeof item === 'string') { boundedText(item, 'Transport text', 32768, true); rawBytes += encoder.encode(item).byteLength; if (rawBytes > maximumBytes) reject('REPORT_TRANSPORT_BYTES', 'Message exceeds its UTF-8 byte bound.'); return item; }
    if (!item || typeof item !== 'object') reject('REPORT_TRANSPORT_VALUE', 'Transport data cannot contain undefined, executable or symbolic values.');
    const object = item as object;
    if (active.has(object)) reject('REPORT_TRANSPORT_CYCLE', 'Transport data cannot contain cycles.');
    active.add(object);
    if (Array.isArray(item)) {
      ownArray(item, 'Transport array', REPORT_WORKER_LIMITS.bars);
      if (nodes + item.length > REPORT_WORKER_LIMITS.messageNodes) reject('REPORT_TRANSPORT_WORK', 'Message rows exceed the remaining validation work.');
      const result: unknown[] = [];
      for (let index = 0; index < item.length; index++) result.push(copy(ownAt(item, index), depth + 1));
      active.delete(object); return result;
    }
    ownRecord(item, 'Transport record', undefined, REPORT_WORKER_LIMITS.recordFields); const result: Record<string, unknown> = {};
    for (const key of Object.keys(item)) { rawBytes += encoder.encode(key).byteLength; if (rawBytes > maximumBytes) reject('REPORT_TRANSPORT_BYTES', 'Message keys exceed the UTF-8 byte bound.'); result[key] = copy(Object.getOwnPropertyDescriptor(item, key)!.value, depth + 1); }
    active.delete(object); return result;
  };
  const detached = copy(value, 0) as T, bytes = encoder.encode(JSON.stringify(detached)).byteLength;
  if (bytes > maximumBytes) reject('REPORT_TRANSPORT_BYTES', 'Serialized message exceeds its UTF-8 byte bound.');
  return { value: detached, bytes };
}
