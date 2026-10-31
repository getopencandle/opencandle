import Decimal from 'decimal.js';
import type { Instrument } from './types';

const D = Decimal.clone({ precision: 32, rounding: Decimal.ROUND_HALF_EVEN });
export type ExitDirection = 'buy' | 'sell';
export interface PaperExitLevelInput { quantity: number; takeProfit?: number; stopLoss?: number; }
export interface PaperExitPlanInput { schemaVersion: 1; mode: 'single' | 'multiple'; levels: PaperExitLevelInput[]; }
export interface PaperSessionPolicy { schemaVersion: 2; entryOutsideRth: boolean; takeProfitOutsideRth: boolean; }
export interface PaperExitAllocation { requestedQuantity: number; allocatedQuantity: number; cappedQuantity: number; coveragePercent: number | null; }
export interface PaperExposureLot {
  id: string; instrumentId: string; instrumentKey: string; generation: number; direction: ExitDirection;
  openingFillId: string | null; migration: boolean; openedQuantity: number; remainingQuantity: number;
  sequence: number; groupId: string | null;
}
export interface PaperPendingExitPlan {
  id: string; parentOrderId: string; revision: number; instrumentKey: string; input: PaperExitPlanInput;
  levelIds: string[]; sequence: number;
}
export interface PaperExitLevel {
  id: string; ordinal: number; requestedQuantity: number; takeProfit?: number; stopLoss?: number;
  filledQuantity: number; allocation: number; status: 'active' | 'filled' | 'cancelled';
  childIds: string[]; activationSequence: number; revision: number;
}
export interface PaperExitGroup {
  id: string; revision: number; owner: 'entry' | 'position-snapshot'; parentOrderId: string | null;
  instrument: Instrument; instrumentKey: string; generation: number; direction: ExitDirection;
  mode: 'single' | 'multiple'; sequence: number; createdAt: number; initialQuantity: number;
  status: 'active' | 'closed' | 'cancelled'; extendedHours: boolean; sessionPolicy?: PaperSessionPolicy; levels: PaperExitLevel[];
}
export interface PaperBracketBook {
  schemaVersion: 1; generations: Record<string, number>; lots: PaperExposureLot[]; groups: PaperExitGroup[];
  pending: Record<string, PaperPendingExitPlan>; quoteBindings: Record<string, string>; orderRevisions: Record<string, number>;
}
export interface PaperChildLink { groupId: string; levelId: string; leg: 'tp' | 'sl'; generation: number; activationSequence: number; }
export interface PaperExitTarget { accountId: string; runId: string; kind: 'parent' | 'group'; id: string; revision: number; generation?: number; }
export const PAPER_BRACKET_LIMITS = { levels: 4, liveGroups: 4096, liveLots: 16384, groups: 100000, lots: 100000, bytes: 20 * 1024 * 1024, nodes: 500000, operations: 2_000_000 } as const;

export function assertPaperPlainData(input: unknown, maxNodes: number = PAPER_BRACKET_LIMITS.nodes): void {
  const work = [{ value: input, depth: 0 }]; let nodes = 0;
  while (work.length) {
    const { value, depth } = work.pop()!;
    if (++nodes > maxNodes || depth > 40) throw new Error('Virtual account data exceeds its validation bounds.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (!value || typeof value !== 'object') throw new Error('Virtual account data must contain finite plain JSON values.');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error('Virtual account data has an unsupported prototype.');
    const keys = Reflect.ownKeys(value);
    if (nodes + work.length + keys.length - (array ? 1 : 0) > maxNodes) throw new Error('Virtual account data exceeds its scheduled validation bound.');
    if (array && keys.length !== value.length + 1) throw new Error('Virtual account arrays must be dense and have no custom properties.');
    for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key)) throw new Error('Virtual account data has an unsafe property.');
      const property = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in property) || (!property.enumerable && !(array && key === 'length'))) throw new Error('Virtual account fields must be enumerable data properties.');
      if (array && key === 'length') continue;
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new Error('Virtual account array has an invalid index.');
      work.push({ value: property.value, depth: depth + 1 });
    }
  }
}
function exactKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported exit configuration field.');
}
export function validatePaperSessionPolicy(input: unknown): PaperSessionPolicy {
  assertPaperPlainData(input, 10);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Session policy must be a versioned plain record.');
  exactKeys(input, ['schemaVersion', 'entryOutsideRth', 'takeProfitOutsideRth']);
  const policy = input as PaperSessionPolicy;
  if (policy.schemaVersion !== 2 || typeof policy.entryOutsideRth !== 'boolean' || typeof policy.takeProfitOutsideRth !== 'boolean') throw new Error('Unsupported session policy version or switches.');
  return { schemaVersion: 2, entryOutsideRth: policy.entryOutsideRth, takeProfitOutsideRth: policy.takeProfitOutsideRth };
}
export function paperInstrumentKey(instrument: Instrument): string {
  assertPaperPlainData(instrument, 100);
  const text = (value: unknown, maximum: number, empty = false): value is string => typeof value === 'string' && value.length <= maximum && (empty || value.trim().length > 0);
  if (!instrument || !['stock', 'etf'].includes(instrument.assetClass) || !text(instrument.id, 256) || ['__proto__', 'prototype', 'constructor'].includes(instrument.id) || !text(instrument.symbol, 64) || !text(instrument.exchange, 100, true) || !text(instrument.name, 500) || !text(instrument.timezone, 100) || typeof instrument.currency !== 'string' || !/^[A-Z]{3}$/.test(instrument.currency)) throw new Error('A supported execution instrument with bounded text metadata is required.');
  for (const increment of [instrument.tickSize, instrument.lotSize]) if (!Number.isFinite(increment) || increment <= 0 || new D(increment).decimalPlaces() > 8) throw new Error('Execution increments must be positive with at most eight decimal places.');
  return JSON.stringify([instrument.id, instrument.symbol, instrument.exchange, instrument.currency, instrument.assetClass, instrument.tickSize, instrument.lotSize]);
}
export function validatePaperExitPlan(input: unknown, instrument: Instrument, direction: ExitDirection): PaperExitPlanInput {
  assertPaperPlainData(input, 100); paperInstrumentKey(instrument);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Exit plan must be a plain configuration.');
  exactKeys(input, ['schemaVersion', 'mode', 'levels']);
  const plan = input as PaperExitPlanInput;
  if (plan.schemaVersion !== 1 || !['single', 'multiple'].includes(plan.mode) || !Array.isArray(plan.levels) || plan.levels.length < 1 || plan.levels.length > 4 || plan.mode === 'single' && plan.levels.length !== 1 || !['buy', 'sell'].includes(direction)) throw new Error('Choose a single exit or one to four paired exit levels.');
  for (const level of plan.levels) {
    if (!level || typeof level !== 'object' || Array.isArray(level)) throw new Error('Exit level must be a plain configuration.');
    exactKeys(level, ['quantity', 'takeProfit', 'stopLoss']);
    if (!Number.isFinite(level.quantity) || level.quantity <= 0 || level.quantity > 1e9 || !new D(level.quantity).mod(instrument.lotSize).isZero()) throw new Error('Exit quantity must be positive and aligned to the instrument lot size.');
    if (level.takeProfit === undefined && level.stopLoss === undefined || plan.mode === 'multiple' && (level.takeProfit === undefined || level.stopLoss === undefined)) throw new Error('Multiple exit levels require both a take profit and a stop loss.');
    for (const price of [level.takeProfit, level.stopLoss]) if (price !== undefined && (!Number.isFinite(price) || price <= 0 || !new D(price).mod(instrument.tickSize).isZero())) throw new Error('Exit prices must be positive and exactly tick-aligned; OpenCandle does not round them.');
    if (level.takeProfit !== undefined && level.stopLoss !== undefined && (direction === 'buy' ? level.takeProfit <= level.stopLoss : level.takeProfit >= level.stopLoss)) throw new Error('Long paired exits require take profit above stop loss; short paired exits require take profit below stop loss.');
  }
  return structuredClone(plan);
}
/** Integer lot arithmetic preserves the requested values even when executable coverage is capped. */
export function allocatePaperExitLevels(requested: readonly number[], capacity: number, lotSize: number): PaperExitAllocation[] {
  if (!Number.isFinite(lotSize) || lotSize <= 0 || new D(lotSize).decimalPlaces() > 8 || !Number.isFinite(capacity) || capacity < 0 || !new D(capacity).mod(lotSize).isZero() || requested.length > 4) throw new Error('Invalid exit allocation basis.');
  let remaining = new D(capacity);
  return requested.map(quantity => {
    if (!Number.isFinite(quantity) || quantity < 0 || !new D(quantity).mod(lotSize).isZero()) throw new Error('Exit allocation quantities must align to whole lots.');
    const allocated = D.min(quantity, remaining); remaining = remaining.sub(allocated);
    return { requestedQuantity: quantity, allocatedQuantity: allocated.toNumber(), cappedQuantity: new D(quantity).sub(allocated).toNumber(), coveragePercent: capacity ? new D(quantity).div(capacity).mul(100).toNumber() : null };
  });
}
export function openingPaperQuantity(previous: number, side: ExitDirection, quantity: number): number {
  const signed = side === 'buy' ? 1 : -1;
  return previous === 0 || Math.sign(previous) === signed ? quantity : D.max(0, new D(quantity).sub(Math.abs(previous))).toNumber();
}
/** Control ownership only. Position P&L remains weighted-average in the authoritative account engine. */
export function consumePaperExposure(lots: readonly PaperExposureLot[], quantity: number, instrumentId: string, generation: number, groupId?: string): { lots: PaperExposureLot[]; affectedGroups: string[] } {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Closing exposure must be positive.');
  const next = lots.map(lot => ({ ...lot })), eligible = next.filter(lot => lot.instrumentId === instrumentId && lot.generation === generation && lot.remainingQuantity > 0 && (groupId === undefined || lot.groupId === groupId)).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  let remaining = new D(quantity); const affected = new Set<string>();
  for (const lot of eligible) {
    const taken = D.min(lot.remainingQuantity, remaining); lot.remainingQuantity = new D(lot.remainingQuantity).sub(taken).toNumber(); remaining = remaining.sub(taken);
    if (taken.gt(0) && lot.groupId) affected.add(lot.groupId);
    if (remaining.isZero()) break;
  }
  if (!remaining.isZero()) throw new Error('Closing quantity exceeds its owned exposure.');
  return { lots: next, affectedGroups: [...affected] };
}
export function paperGroupCapacity(book: PaperBracketBook, groupId: string): number {
  return book.lots.reduce((sum, lot) => lot.groupId === groupId ? sum.add(lot.remainingQuantity) : sum, new D(0)).toNumber();
}
