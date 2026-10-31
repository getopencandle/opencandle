import { cloneLocalAlert, setLocalAlertPaused, validateLocalAlerts, type LocalAlert } from './alerts';

export type AlertBatchAction = 'pause' | 'resume' | 'delete' | 'clone';
export type AlertBatchUnchangedReason = 'already-paused' | 'already-active' | 'waiting-for-data' | 'stopped' | 'expired' | 'expiration-due';
export interface AlertBatchUnchanged { readonly id: string; readonly reason: AlertBatchUnchangedReason; }
export interface AlertBatchPlan {
  readonly action: AlertBatchAction;
  readonly preparedAt: number;
  readonly selectedIds: readonly string[];
  readonly selectedCount: number;
  readonly eligibleIds: readonly string[];
  readonly unchanged: readonly AlertBatchUnchanged[];
  readonly removedHistoryCount: number;
}
export interface AlertBatchCandidate {
  readonly base: readonly LocalAlert[];
  readonly candidate: readonly LocalAlert[];
  readonly changed: boolean;
  readonly eligibleIds: readonly string[];
  readonly unchanged: readonly AlertBatchUnchanged[];
  readonly removedHistoryCount: number;
  /** New identities appended by a clone batch, in selected order. Empty for other actions. */
  readonly createdIds: readonly string[];
}

// These are the existing validateLocalAlerts ceilings, not new batch quotas.
const MAX_ALERTS = 10_000, MAX_HISTORY = 100_000, MAX_NODES = 500_000, MAX_BYTES = 20 * 1024 * 1024;
const statuses = new Set<LocalAlert['status']>(['active', 'paused', 'stopped', 'expired', 'waiting-for-data']);
type HistoryIdentity = readonly [string, string, string, string, number, number];
type Target = Readonly<{ id: string; revision: number; status: LocalAlert['status']; armedAt: number; definition: string; eligibility: AlertBatchUnchangedReason | null; history: readonly HistoryIdentity[] | null }>;
type Metadata = { row: LocalAlert; id: string; revision: number; status: LocalAlert['status']; armedAt: number; lastTime: number | null; expiresAt: number | null; definition: LocalAlert['definition']; };
const plans = new WeakMap<AlertBatchPlan, readonly Target[]>();
const encoder = new TextEncoder();
function refuse(message: string): never { throw new Error(message); }
function clock(now: number) { if (!Number.isSafeInteger(now) || now < 0) refuse('A valid local alert evaluation clock is required.'); }
function data(record: unknown, key: string): unknown {
  if (!record || typeof record !== 'object') refuse('Alert batch metadata must contain own data.');
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) refuse('Alert batch metadata must contain own data.');
  return descriptor.value;
}
function dense(value: unknown, maximum: number): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) refuse('Alert batch array exceeds existing limits or is not dense.');
  for (let i = 0; i < value.length; i++) data(value, String(i));
}
function identity(value: unknown, maximum = 500): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > maximum) refuse('Invalid alert batch identity.');
}
function index(base: readonly LocalAlert[]) {
  dense(base, MAX_ALERTS); const result = new Map<string, LocalAlert>();
  for (let i = 0; i < base.length; i++) {
    const row = data(base, String(i)) as LocalAlert, id = data(data(row, 'definition'), 'id'); identity(id);
    if (result.has(id)) refuse('Duplicate alert identity.'); result.set(id, row);
  }
  return result;
}
function metadata(row: LocalAlert): Metadata {
  const definition = data(row, 'definition') as LocalAlert['definition'], id = data(definition, 'id'); identity(id);
  const revision = data(row, 'revision'), status = data(row, 'status') as LocalAlert['status'], armedAt = data(row, 'armedAt'), lastTime = data(row, 'lastTime'), expiresAt = data(definition, 'expiresAt');
  if (!Number.isSafeInteger(revision) || (revision as number) < 1 || !statuses.has(status) || !Number.isSafeInteger(armedAt) || (armedAt as number) < 0 || lastTime !== null && (!Number.isSafeInteger(lastTime) || (lastTime as number) < 0) || expiresAt !== null && (!Number.isSafeInteger(expiresAt) || (expiresAt as number) < 0)) refuse('Invalid alert batch lifecycle metadata.');
  return { row, definition, id, revision: revision as number, status, armedAt: armedAt as number, lastTime: lastTime as number | null, expiresAt: expiresAt as number | null };
}
function resumeClock(row: Metadata, now: number) {
  if (row.status === 'paused' && (now < row.armedAt || row.lastTime !== null && now < row.lastTime)) refuse('The local evaluation clock precedes a selected paused alert lifecycle.');
}
function eligibility(row: Metadata, action: AlertBatchAction, now: number): AlertBatchUnchangedReason | null {
  if (action === 'delete') return null;
  if (action === 'clone') return row.status === 'expired' ? 'expired' : row.expiresAt !== null && row.expiresAt <= now ? 'expiration-due' : null;
  if (row.status === 'stopped' || row.status === 'expired') return row.status;
  if (action === 'pause') return row.status === 'paused' ? 'already-paused' : null;
  if (row.status !== 'paused') return row.status === 'active' ? 'already-active' : 'waiting-for-data';
  return row.expiresAt !== null && row.expiresAt <= now ? 'expiration-due' : null;
}

// Canonical definition identity is detached text, including unknown JSON fields.
// Number -0 stays distinct conservatively. Metrics count ordinary JSON bytes;
// its one extra identity character does not impose a new resource restriction.
function budget() { return { nodes: 0, bytes: 0 }; }
function canonical(value: unknown, usage: ReturnType<typeof budget>, depth = 2, ancestors = new Set<object>()): string {
  if (++usage.nodes > MAX_NODES || depth > 40) refuse('Alert batch metadata exceeds existing structural limits.');
  const charge = (part: string) => { usage.bytes += encoder.encode(part).length; if (usage.bytes > MAX_BYTES) refuse('Alert batch metadata exceeds existing byte limits.'); return part; };
  const string = (part: string) => { if (part.length > MAX_BYTES - usage.bytes) refuse('Alert batch metadata exceeds existing byte limits.'); return charge(JSON.stringify(part)); };
  if (value === null || typeof value === 'boolean') return charge(JSON.stringify(value));
  if (typeof value === 'string') { if (value.length > 100_000) refuse('Alert batch metadata exceeds existing string limits.'); return string(value); }
  if (typeof value === 'number') { if (!Number.isFinite(value)) refuse('Alert batch metadata numbers must be finite.'); const encoded = charge(JSON.stringify(value)); return Object.is(value, -0) ? '-0' : encoded; }
  if (!value || typeof value !== 'object' || ancestors.has(value)) refuse('Alert batch metadata must be acyclic JSON.');
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) refuse('Alert batch metadata must be plain JSON.');
  const names = Reflect.ownKeys(value);
  if (names.length > MAX_NODES - usage.nodes + (array ? 1 : 0)) refuse('Alert batch metadata exceeds existing structural limits.');
  ancestors.add(value); let output: string;
  if (array) {
    dense(value, MAX_NODES); charge('['); const parts: string[] = [];
    for (let i = 0; i < value.length; i++) { if (i) charge(','); parts.push(canonical(data(value, String(i)), usage, depth + 1, ancestors)); }
    charge(']'); output = '[' + parts.join(',') + ']';
  } else {
    if (names.some(key => typeof key !== 'string')) refuse('Alert batch metadata cannot contain symbols.');
    charge('{'); const parts: string[] = [];
    for (const key of (names as string[]).sort()) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') refuse('Unsafe alert batch metadata key.');
      if (parts.length) charge(','); const name = string(key); charge(':'); parts.push(name + ':' + canonical(data(value, key), usage, depth + 1, ancestors));
    }
    charge('}'); output = '{' + parts.join(',') + '}';
  }
  ancestors.delete(value); return output;
}
function historyIdentity(row: Metadata, usage: ReturnType<typeof budget>): readonly HistoryIdentity[] {
  const history = data(row.row, 'history'); dense(history, MAX_HISTORY); const ids = new Set<string>(), output: HistoryIdentity[] = [];
  for (let i = 0; i < history.length; i++) {
    const item = data(history, String(i)), id = data(item, 'id'), alertId = data(item, 'alertId'), mode = data(item, 'mode'), runId = data(item, 'runId'), at = data(item, 'at'), sequence = data(item, 'sequence');
    identity(id, 100_000); identity(alertId); identity(runId);
    if (ids.has(id) || alertId !== row.id || mode !== 'ordinary' && mode !== 'replay' || !Number.isSafeInteger(at) || (at as number) < 0 || !Number.isSafeInteger(sequence) || (sequence as number) < 0) refuse('Invalid alert deletion history identity.');
    ids.add(id); const tuple = Object.freeze([id, alertId, mode, runId, at as number, sequence as number] as const);
    canonical(tuple, usage); output.push(tuple);
  }
  return Object.freeze(output);
}
function sameHistory(left: readonly HistoryIdentity[], right: readonly HistoryIdentity[]) {
  return left.length === right.length && left.every((item, index) => item.every((value, part) => value === right[index][part]));
}

/** Input is an already-admitted LocalAlert JSON collection. This helper is not
 * an untrusted input boundary or UI/view permission. Plans are immutable and
 * exact-object (copies are refused), reusable, and cannot detect an unobserved
 * A-to-B-to-A transition. UI must own one-use actions and publication. */
export function prepareAlertBatch(base: readonly LocalAlert[], selectedIds: readonly string[], action: AlertBatchAction, now: number): AlertBatchPlan {
  if (action !== 'pause' && action !== 'resume' && action !== 'delete' && action !== 'clone') refuse('Unsupported alert batch action.'); clock(now);
  const byId = index(base); dense(selectedIds, MAX_ALERTS); const seen = new Set<string>(), targets: Target[] = [], eligibleIds: string[] = [], unchanged: AlertBatchUnchanged[] = [], usage = budget(); let removedHistoryCount = 0;
  for (let i = 0; i < selectedIds.length; i++) {
    const id = data(selectedIds, String(i)); identity(id); if (seen.has(id)) refuse('Duplicate selected alert identity.'); seen.add(id);
    const current = byId.get(id); if (!current) refuse('A selected alert no longer exists.'); const row = metadata(current); if (action === 'resume') resumeClock(row, now);
    const definition = canonical(row.definition, usage), reason = eligibility(row, action, now), history = action === 'delete' ? historyIdentity(row, usage) : null;
    targets.push(Object.freeze({ id, revision: row.revision, status: row.status, armedAt: row.armedAt, definition, eligibility: reason, history }));
    if (reason === null) eligibleIds.push(id); else unchanged.push(Object.freeze({ id, reason })); removedHistoryCount += history?.length ?? 0;
  }
  if (action === 'clone' && byId.size + eligibleIds.length > MAX_ALERTS) refuse(`Cloning ${eligibleIds.length} alerts would exceed the ${MAX_ALERTS} local alert limit. No copies were prepared.`);
  const plan: AlertBatchPlan = Object.freeze({ action, preparedAt: now, selectedIds: Object.freeze(targets.map(row => row.id)), selectedCount: targets.length, eligibleIds: Object.freeze(eligibleIds), unchanged: Object.freeze(unchanged), removedHistoryCount });
  plans.set(plan, Object.freeze(targets)); return plan;
}

/** Recheck a prepared target basis without constructing a mutation candidate.
 * This reads admitted metadata; it is not a UI owner or one-use permission. */
export function assertAlertBatchCurrent(plan: AlertBatchPlan, latest: readonly LocalAlert[], now: number): void {
  const targets = plans.get(plan); if (!targets) refuse('Unknown alert batch plan.'); clock(now);
  if ((plan.action === 'resume' || plan.action === 'clone') && now < plan.preparedAt) refuse('The local evaluation clock moved backward after preparation.');
  const byId = index(latest), usage = budget();
  for (const target of targets) {
    const current = byId.get(target.id); if (!current) refuse('A selected alert no longer exists.'); const row = metadata(current);
    if (plan.action === 'resume') resumeClock(row, now);
    if (row.revision !== target.revision || row.status !== target.status || row.armedAt !== target.armedAt || canonical(row.definition, usage) !== target.definition || eligibility(row, plan.action, now) !== target.eligibility) refuse('The prepared alert batch changed. Refresh its preview.');
    if (target.history && !sameHistory(target.history, historyIdentity(row, usage))) refuse('Selected alert history changed. Review deletion again.');
  }
}

/** Build one validated candidate from the exact latest base, without publishing.
 * Untouched references survive validation; its full cloned result is discarded.
 * A no-op returns latest itself, without validating/cloning it again. */
export function applyAlertBatch(plan: AlertBatchPlan, latest: readonly LocalAlert[], now: number, createId?: () => string): AlertBatchCandidate {
  assertAlertBatchCurrent(plan, latest, now);
  const changed = plan.eligibleIds.length > 0;
  const result = (candidate: readonly LocalAlert[], createdIds: readonly string[] = []): AlertBatchCandidate => Object.freeze({ base: latest, candidate, changed, eligibleIds: plan.eligibleIds, unchanged: plan.unchanged, removedHistoryCount: plan.removedHistoryCount, createdIds: Object.freeze([...createdIds]) });
  if (!changed) return result(latest);
  if (plan.action === 'clone') return applyClone(plan, latest, now, createId, result);
  const selected = new Set(plan.eligibleIds), candidate: LocalAlert[] = [];
  for (let i = 0; i < latest.length; i++) {
    const row = latest[i]; if (!selected.has(row.definition.id)) candidate.push(row);
    else if (plan.action !== 'delete') candidate.push(setLocalAlertPaused(row, plan.action === 'pause'));
  }
  const checked = validateLocalAlerts(candidate); if (!checked.ok) refuse(checked.errors.join(' ') || 'Alert batch validation failed.');
  return result(Object.freeze(candidate));
}

/** LV clone policy (reference fields unresolved): each eligible selected alert is
 * copied by cloneLocalAlert under a fresh caller-supplied identity, appended after
 * the existing collection in selected order. Originals are retained exactly.
 * Any identity collision or validation failure refuses the whole batch. */
function applyClone(plan: AlertBatchPlan, latest: readonly LocalAlert[], now: number, createId: (() => string) | undefined, result: (candidate: readonly LocalAlert[], createdIds: readonly string[]) => AlertBatchCandidate): AlertBatchCandidate {
  if (typeof createId !== 'function') refuse('Cloning requires a new alert identity source.');
  if (latest.length + plan.eligibleIds.length > MAX_ALERTS) refuse(`Cloning would exceed the ${MAX_ALERTS} local alert limit. No copies were saved.`);
  const byId = new Map(latest.map(row => [row.definition.id, row] as const)), used = new Set(byId.keys()), createdIds: string[] = [], copies: LocalAlert[] = [];
  for (const id of plan.eligibleIds) {
    const fresh = createId(); identity(fresh);
    if (used.has(fresh)) refuse('A new alert identity collided with an existing alert. No copies were saved.');
    used.add(fresh); createdIds.push(fresh); copies.push(cloneLocalAlert(byId.get(id)!, fresh, now));
  }
  const candidate = [...latest, ...copies];
  const checked = validateLocalAlerts(candidate); if (!checked.ok) refuse(checked.errors.join(' ') || 'Alert clone validation failed.');
  return result(Object.freeze(candidate), createdIds);
}
