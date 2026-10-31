import Decimal from 'decimal.js';
import type { Instrument, Quote } from './types';
import type { PaperAccount, PaperOrder, PaperFill } from './paper';
import { allocatePaperExitLevels, assertPaperPlainData, consumePaperExposure, openingPaperQuantity, paperInstrumentKey, validatePaperExitPlan, validatePaperSessionPolicy, PAPER_BRACKET_LIMITS, type PaperBracketBook, type PaperExitGroup, type PaperExitPlanInput, type PaperExitTarget } from './paper-brackets';

const D = Decimal.clone({ precision: 32 });
const working = (order: PaperOrder) => order.status === 'working' || order.status === 'triggered';
export function paperSerial(account: PaperAccount): number {
  if (!Number.isSafeInteger(account.nextId) || account.nextId < 1 || account.nextId >= Number.MAX_SAFE_INTEGER) throw new Error('Virtual account identity sequence is exhausted.');
  return account.nextId++;
}
function id(account: PaperAccount, kind: string): string { return `${account.id}:${kind}:${paperSerial(account)}`; }
function event(account: PaperAccount, order: PaperOrder, at: number, type: 'submitted' | 'modified' | 'cancelled', message: string): void {
  account.events.push({ id: paperSerial(account), orderId: order.id, at, type, message });
}
export function ensurePaperBrackets(account: PaperAccount): PaperBracketBook {
  if (account.brackets) return account.brackets;
  const book: PaperBracketBook = { schemaVersion: 1, generations: {}, lots: [], groups: [], pending: {}, quoteBindings: {}, orderRevisions: {} };
  account.brackets = book;
  for (const position of Object.values(account.positions)) {
    const serial = paperSerial(account); book.generations[position.instrument.id] = 1;
    book.lots.push({ id: `${account.id}:lot:${serial}`, instrumentId: position.instrument.id, instrumentKey: paperInstrumentKey(position.instrument), generation: 1, direction: position.quantity > 0 ? 'buy' : 'sell', openingFillId: null, migration: true, openedQuantity: Math.abs(position.quantity), remainingQuantity: Math.abs(position.quantity), sequence: serial, groupId: null });
  }
  return book;
}
export function registerPaperExitPlan(account: PaperAccount, order: PaperOrder): void {
  if (!order.exits) return;
  const book = ensurePaperBrackets(account), input = validatePaperExitPlan(order.exits, order.instrument, order.side), serial = paperSerial(account);
  book.pending[order.id] = { id: `${account.id}:exit:${serial}`, parentOrderId: order.id, revision: 1, instrumentKey: paperInstrumentKey(order.instrument), input, levelIds: input.levels.map(() => id(account, 'level')), sequence: serial };
  book.orderRevisions[order.id] = 1;
}
export function requiresPaperQuoteMetadata(account: PaperAccount, instrumentId: string): boolean {
  const book = account.brackets;
  return !!book && (book.groups.some(group => group.status === 'active' && group.instrument.id === instrumentId) || account.orders.some(order => order.instrument.id === instrumentId && working(order) && !!book.pending[order.id]));
}
export function admitPaperQuoteMetadata(account: PaperAccount, quote: Quote, instrument?: Instrument): void {
  if (!instrument) { if (requiresPaperQuoteMetadata(account, quote.instrumentId)) throw new Error('Bracket execution requires explicit quote instrument metadata.'); return; }
  if (instrument.id !== quote.instrumentId) throw new Error('Quote instrument metadata does not match its instrument ID.');
  const key = paperInstrumentKey(instrument), book = ensurePaperBrackets(account);
  const position = account.positions[instrument.id];
  if (position && paperInstrumentKey(position.instrument) !== key || book.lots.some(lot => lot.instrumentId === instrument.id && lot.remainingQuantity > 0 && lot.instrumentKey !== key) || account.orders.some(order => working(order) && order.instrument.id === instrument.id && paperInstrumentKey(order.instrument) !== key)) throw new Error('Quote execution metadata changed from the owned order or position.');
  book.quoteBindings[instrument.id] = key;
}
export function paperBracketQuoteReady(account: PaperAccount, order: PaperOrder, quote: Quote): boolean {
  if (!order.exits && !order.bracket && !requiresPaperQuoteMetadata(account, order.instrument.id)) return true;
  return account.brackets?.quoteBindings[order.instrument.id] === paperInstrumentKey(order.instrument) && (!order.bracket || quote.sequence > order.bracket.activationSequence);
}
function cancelChild(account: PaperAccount, order: PaperOrder, at: number, reason: string): void {
  if (!working(order)) return;
  order.status = 'cancelled'; order.updatedAt = at; event(account, order, at, 'cancelled', reason);
}
export function terminatePaperExitOrder(account: PaperAccount, order: PaperOrder, now: number): void {
  const book = account.brackets; if (!book) return;
  delete book.pending[order.id];
  if (!order.bracket) return;
  const group = book.groups.find(item => item.id === order.bracket!.groupId), level = group?.levels.find(item => item.id === order.bracket!.levelId);
  if (!group || !level) throw new Error('Bracket order ownership is missing.');
  level.status = 'cancelled'; level.allocation = 0; level.revision++;
  for (const childId of level.childIds) { const child = account.orders.find(item => item.id === childId); if (!child) throw new Error('OCO sibling is missing.'); cancelChild(account, child, now, 'Paired virtual exit cancelled with its sibling.'); }
  group.revision++;
  if (group.levels.every(row => row.status !== 'active')) group.status = 'cancelled';
}
export function revisePaperOrder(account: PaperAccount, order: PaperOrder): void {
  if (!account.brackets) return;
  const prior = account.brackets.orderRevisions[order.id] ?? 0;
  if (prior >= Number.MAX_SAFE_INTEGER) throw new Error('Virtual order revision is exhausted.');
  account.brackets.orderRevisions[order.id] = prior + 1;
}
function makeChild(account: PaperAccount, group: PaperExitGroup, level: PaperExitGroup['levels'][number], leg: 'tp' | 'sl', now: number): PaperOrder {
  const serial = paperSerial(account), price = leg === 'tp' ? level.takeProfit : level.stopLoss;
  if (price === undefined || level.allocation <= 0) throw new Error('A working child needs a positive executable allocation and price.');
  const extendedHours = group.sessionPolicy ? leg === 'tp' && group.sessionPolicy.takeProfitOutsideRth : group.extendedHours;
  const order: PaperOrder = { id: `${account.id}:order:${serial}`, instrument: structuredClone(group.instrument), side: group.direction === 'buy' ? 'sell' : 'buy', type: leg === 'tp' ? 'limit' : 'stop', quantity: level.allocation, ...(leg === 'tp' ? { limitPrice: price } : { stopPrice: price }), timeInForce: 'GTC', reduceOnly: true, extendedHours, status: 'working', createdAt: now, updatedAt: now, filledQuantity: 0, averageFillPrice: null, submissionSequence: serial, bracket: { groupId: group.id, levelId: level.id, leg, generation: group.generation, activationSequence: level.activationSequence } };
  account.orders.push(order); level.childIds.push(order.id); event(account, order, now, 'submitted', `Virtual ${leg === 'tp' ? 'take profit' : 'stop loss'} ${level.allocation} at ${price}.`);
  return order;
}
export function reallocatePaperExits(account: PaperAccount, instrumentId: string, now: number): void {
  const book = account.brackets; if (!book) return;
  const capacities = new Map<string, Decimal>(), orders = new Map(account.orders.map(order => [order.id, order]));
  for (const lot of book.lots) if (lot.groupId) capacities.set(lot.groupId, (capacities.get(lot.groupId) ?? new D(0)).add(lot.remainingQuantity));
  const barrier = account.quotes[instrumentId]?.sequence ?? -1;
  for (const group of book.groups) {
    if (group.instrument.id !== instrumentId || group.status !== 'active') continue;
    const capacity = capacities.get(group.id)?.toNumber() ?? 0;
    const allocations = allocatePaperExitLevels(group.levels.map(level => level.status === 'active' ? new D(level.requestedQuantity).sub(level.filledQuantity).toNumber() : 0), capacity, group.instrument.lotSize);
    group.levels.forEach((level, index) => {
      const next = allocations[index].allocatedQuantity, previous = level.allocation;
      if (level.status !== 'active') return;
      if (next !== previous) { level.revision++; group.revision++; level.activationSequence = barrier; }
      level.allocation = next;
      for (const childId of level.childIds) {
        const child = orders.get(childId); if (!child) throw new Error('Virtual exit child history is missing.');
        if (!working(child)) continue;
        if (next === 0) cancelChild(account, child, now, 'Exit allocation is now zero; requested coverage remains visible.');
        else if (next !== child.quantity) { child.quantity = next; child.updatedAt = now; child.bracket!.activationSequence = barrier; event(account, child, now, 'modified', `Virtual exit allocation changed to ${next}; requested ${level.requestedQuantity}.`); }
      }
      if (next > 0) for (const leg of ['tp', 'sl'] as const) {
        if ((leg === 'tp' ? level.takeProfit : level.stopLoss) === undefined) continue;
        if (!level.childIds.some(childId => { const child = orders.get(childId); return !!child && working(child) && child.bracket?.leg === leg; })) {
          level.activationSequence = barrier; const child = makeChild(account, group, level, leg, now); orders.set(child.id, child);
        }
      }
    });
    if (capacity === 0 || group.levels.every(level => level.status !== 'active')) { group.status = 'closed'; for (const level of group.levels) if (level.status === 'active') level.status = 'cancelled'; }
  }
}
export function applyPaperBracketFill(account: PaperAccount, order: PaperOrder, previousQuantity: number, fill: PaperFill, now: number): void {
  const book = account.brackets; if (!book) return;
  const instrumentId = order.instrument.id, generation = book.generations[instrumentId] ?? 0;
  const closing = previousQuantity !== 0 && Math.sign(previousQuantity) !== (order.side === 'buy' ? 1 : -1) ? Math.min(Math.abs(previousQuantity), order.quantity) : 0;
  if (order.bracket) {
    const group = book.groups.find(row => row.id === order.bracket!.groupId), level = group?.levels.find(row => row.id === order.bracket!.levelId);
    if (!group || !level || group.status !== 'active' || level.status !== 'active' || group.generation !== generation || order.bracket.generation !== generation || level.allocation !== order.quantity) throw new Error('Exit allocation or position generation changed before filling.');
    level.status = 'filled'; level.filledQuantity = order.quantity; level.allocation = 0; level.revision++; group.revision++;
    for (const childId of level.childIds) { const sibling = account.orders.find(row => row.id === childId); if (!sibling) throw new Error('OCO sibling history is missing.'); if (sibling.id !== order.id) cancelChild(account, sibling, now, 'OCO sibling filled; virtual paired order cancelled.'); }
  }
  if (closing > 0) book.lots = consumePaperExposure(book.lots, closing, instrumentId, generation, order.bracket?.groupId).lots;
  const opening = openingPaperQuantity(previousQuantity, order.side, order.quantity), pending = book.pending[order.id];
  delete book.pending[order.id];
  if (opening > 0) {
    const changedGeneration = previousQuantity === 0 || Math.sign(previousQuantity) !== (order.side === 'buy' ? 1 : -1);
    const nextGeneration = changedGeneration ? generation + 1 : generation;
    if (!Number.isSafeInteger(nextGeneration) || nextGeneration < 1) throw new Error('Position generation is exhausted.');
    book.generations[instrumentId] = nextGeneration;
    const serial = paperSerial(account);
    book.lots.push({ id: `${account.id}:lot:${serial}`, instrumentId, instrumentKey: paperInstrumentKey(order.instrument), generation: nextGeneration, direction: order.side, openingFillId: fill.id, migration: false, openedQuantity: opening, remainingQuantity: opening, sequence: serial, groupId: pending?.id ?? null });
    if (pending) book.groups.push({ id: pending.id, revision: pending.revision, owner: 'entry', parentOrderId: order.id, instrument: structuredClone(order.instrument), instrumentKey: pending.instrumentKey, generation: nextGeneration, direction: order.side, mode: pending.input.mode, sequence: pending.sequence, createdAt: now, initialQuantity: opening, status: 'active', extendedHours: order.extendedHours ?? false, ...(order.sessionPolicy ? { sessionPolicy: structuredClone(order.sessionPolicy) } : {}), levels: pending.input.levels.map((level, ordinal) => ({ id: pending.levelIds[ordinal], ordinal, requestedQuantity: level.quantity, ...(level.takeProfit === undefined ? {} : { takeProfit: level.takeProfit }), ...(level.stopLoss === undefined ? {} : { stopLoss: level.stopLoss }), filledQuantity: 0, allocation: 0, status: 'active', childIds: [], activationSequence: account.quotes[instrumentId]?.sequence ?? -1, revision: 1 })) });
  } else if (pending) event(account, order, now, 'modified', 'Exit plan created no children because this fill opened no new exposure.');
  reallocatePaperExits(account, instrumentId, now);
}
export function estimatePaperBracketWork(account: PaperAccount, candidates = 1): number {
  if (!Number.isSafeInteger(candidates) || candidates < 0) throw new Error('Invalid virtual execution candidate count.');
  if (!account.brackets) return 0;
  // Nested instrument/link records and retained annotations participate in each clone/validation pass.
  const weight = account.orders.length * 64 + account.fills.length * 16 + account.events.length * 8 + account.brackets.lots.length * 16 + account.brackets.groups.length * 128;
  return weight * (candidates + 3);
}
export function assertPaperBracketBudget(account: PaperAccount, candidates = 1): void {
  if (estimatePaperBracketWork(account, candidates) > PAPER_BRACKET_LIMITS.operations) throw new Error('Virtual bracket operation exceeds its bounded work budget. No partial execution was committed.');
}
export function paperExitTarget(account: PaperAccount, kind: 'parent' | 'group', targetId: string): PaperExitTarget {
  const book = account.brackets;
  if (kind === 'parent') { const pending = book?.pending[targetId]; if (!pending) throw new Error('Pending exit plan is unavailable.'); return { accountId: account.id, runId: account.runId, kind, id: targetId, revision: book!.orderRevisions[targetId] ?? pending.revision }; }
  const group = book?.groups.find(row => row.id === targetId); if (!group) throw new Error('Exit group is unavailable.');
  return { accountId: account.id, runId: account.runId, kind, id: targetId, revision: group.revision, generation: group.generation };
}
export function assertPaperExitTarget(account: PaperAccount, target: PaperExitTarget): void {
  if (JSON.stringify(paperExitTarget(account, target.kind, target.id)) !== JSON.stringify(target)) throw new Error('Exit target changed. Reopen the current group before modifying it.');
}
export function validatePaperBracketState(account: PaperAccount): void {
  const book = account.brackets; if (!book) return;
  assertPaperPlainData(book);
  if (book.schemaVersion !== 1 || !Array.isArray(book.lots) || !Array.isArray(book.groups) || !book.pending || !book.quoteBindings || !book.orderRevisions || !book.generations) throw new Error('Invalid bracket extension schema.');
  const keys = (value: unknown, allowed: readonly string[]) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== allowed.length || allowed.some(key => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown or missing bracket state field.'); };
  keys(book, ['schemaVersion', 'generations', 'lots', 'groups', 'pending', 'quoteBindings', 'orderRevisions']);
  for (const dictionary of [book.generations, book.pending, book.quoteBindings, book.orderRevisions]) if (Array.isArray(dictionary) || typeof dictionary !== 'object') throw new Error('Invalid bracket dictionary.');
  for (const generation of Object.values(book.generations)) if (!Number.isSafeInteger(generation) || generation < 1) throw new Error('Invalid position generation.');
  for (const revision of Object.values(book.orderRevisions)) if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid order revision.');
  if (new TextEncoder().encode(JSON.stringify(book)).byteLength > PAPER_BRACKET_LIMITS.bytes || book.groups.length > PAPER_BRACKET_LIMITS.groups || book.lots.length > PAPER_BRACKET_LIMITS.lots || book.groups.filter(row => row.status === 'active').length > PAPER_BRACKET_LIMITS.liveGroups || book.lots.filter(row => row.remainingQuantity > 0).length > PAPER_BRACKET_LIMITS.liveLots || account.orders.length > 100000 || account.fills.length > 100000 || account.events.length > 1000000) throw new Error('Virtual bracket history or live-state quota exceeded. Existing history was retained.');
  const ids = new Set<string>(), groupMap = new Map(book.groups.map(group => [group.id, group])), orders = new Map(account.orders.map(order => [order.id, order])), fills = new Map(account.fills.map(fill => [fill.id, fill])), fillsByOrder = new Map(account.fills.map(fill => [fill.orderId, fill])), totals = new Map<string, Decimal>(), capacities = new Map<string, Decimal>();
  const quantities = new Map<string, Decimal>(), openings = new Map<string, number>(), lotFills = new Set<string>();
  for (const fill of account.fills) { const previous = quantities.get(fill.instrumentId) ?? new D(0); openings.set(fill.id, openingPaperQuantity(previous.toNumber(), fill.side, fill.quantity)); quantities.set(fill.instrumentId, previous.add(new D(fill.quantity).mul(fill.side === 'buy' ? 1 : -1))); }
  const register = (value: string, kind: string) => { if (typeof value !== 'string' || !value.startsWith(`${account.id}:${kind}:`) || ids.has(value) || value.length > 512) throw new Error('Invalid or duplicate bracket identity.'); ids.add(value); const serial = Number(value.split(':').at(-1)); if (!Number.isSafeInteger(serial) || serial < 1 || serial >= account.nextId || value !== `${account.id}:${kind}:${serial}`) throw new Error('Bracket identity sequence is invalid.'); };
  for (const [instrumentId, binding] of Object.entries(book.quoteBindings)) {
    if (typeof binding !== 'string' || binding.length > 1500 || !account.quotes[instrumentId]) throw new Error('Invalid quote execution binding.');
    const tuple: unknown = JSON.parse(binding);
    if (!Array.isArray(tuple) || tuple.length !== 7 || tuple[0] !== instrumentId || paperInstrumentKey({ id: tuple[0], symbol: tuple[1], exchange: tuple[2], currency: tuple[3], assetClass: tuple[4], tickSize: tuple[5], lotSize: tuple[6], name: 'Declared execution instrument', timezone: 'UTC' } as Instrument) !== binding) throw new Error('Noncanonical quote execution binding.');
  }
  for (const [orderId] of Object.entries(book.orderRevisions)) if (!orders.has(orderId)) throw new Error('Order revision has no order.');
  for (const lot of book.lots) {
    keys(lot, ['id', 'instrumentId', 'instrumentKey', 'generation', 'direction', 'openingFillId', 'migration', 'openedQuantity', 'remainingQuantity', 'sequence', 'groupId']); register(lot.id, 'lot');
    if (!Number.isFinite(lot.openedQuantity) || lot.openedQuantity <= 0 || !Number.isFinite(lot.remainingQuantity) || lot.remainingQuantity < 0 || lot.remainingQuantity > lot.openedQuantity || !Number.isSafeInteger(lot.sequence) || lot.sequence < 1 || !Number.isSafeInteger(lot.generation) || lot.generation < 1 || !['buy', 'sell'].includes(lot.direction) || typeof lot.migration !== 'boolean' || lot.migration !== (lot.openingFillId === null)) throw new Error('Invalid control exposure lot.');
    if (!lot.migration) {
      const openingFill = fills.get(lot.openingFillId!);
      if (!openingFill || openingFill.instrumentId !== lot.instrumentId || openingFill.side !== lot.direction || openings.get(openingFill.id) !== lot.openedQuantity || lotFills.has(openingFill.id)) throw new Error('Exposure opening fill or quantity is inconsistent.');
      lotFills.add(openingFill.id);
    }
    if (lot.groupId !== null) {
      const group = groupMap.get(lot.groupId);
      if (!group || group.instrument.id !== lot.instrumentId || group.instrumentKey !== lot.instrumentKey || group.generation !== lot.generation || group.direction !== lot.direction || group.owner === 'entry' && (lot.migration || fills.get(lot.openingFillId!)?.orderId !== group.parentOrderId)) throw new Error('Exposure group identity or parent fill is inconsistent.');
    }
    if (lot.remainingQuantity > 0) {
      const position = account.positions[lot.instrumentId];
      if (!position || paperInstrumentKey(position.instrument) !== lot.instrumentKey || book.generations[lot.instrumentId] !== lot.generation || (position.quantity > 0 ? 'buy' : 'sell') !== lot.direction || !new D(lot.remainingQuantity).mod(position.instrument.lotSize).isZero()) throw new Error('Exposure lot disagrees with current position identity.');
      totals.set(lot.instrumentId, (totals.get(lot.instrumentId) ?? new D(0)).add(lot.remainingQuantity));
    }
    if (lot.groupId) capacities.set(lot.groupId, (capacities.get(lot.groupId) ?? new D(0)).add(lot.remainingQuantity));
  }
  for (const position of Object.values(account.positions)) if (!(totals.get(position.instrument.id) ?? new D(0)).eq(Math.abs(position.quantity))) throw new Error('Control exposure does not equal the current virtual position.');
  for (const [orderId, pending] of Object.entries(book.pending)) {
    keys(pending, ['id', 'parentOrderId', 'revision', 'instrumentKey', 'input', 'levelIds', 'sequence']);
    const parent = orders.get(orderId); register(pending.id, 'exit'); pending.levelIds.forEach(value => register(value, 'level'));
    if (!parent || !working(parent) || pending.parentOrderId !== orderId || paperInstrumentKey(parent.instrument) !== pending.instrumentKey || !Number.isSafeInteger(pending.revision) || pending.revision < 1 || pending.levelIds.length !== pending.input.levels.length) throw new Error('Invalid pending exit ownership.');
    validatePaperExitPlan(pending.input, parent.instrument, parent.side);
    if (!parent.exits || JSON.stringify(parent.exits) !== JSON.stringify(pending.input) || !book.orderRevisions[orderId]) throw new Error('Pending plan disagrees with its parent order.');
  }
  for (const group of book.groups) {
    keys(group, ['id', 'revision', 'owner', 'parentOrderId', 'instrument', 'instrumentKey', 'generation', 'direction', 'mode', 'sequence', 'createdAt', 'initialQuantity', 'status', 'extendedHours', ...(group.sessionPolicy === undefined ? [] : ['sessionPolicy']), 'levels']); register(group.id, 'exit');
    if (paperInstrumentKey(group.instrument) !== group.instrumentKey || !Number.isSafeInteger(group.generation) || group.generation < 1 || !Number.isSafeInteger(group.revision) || group.revision < 1 || !['active', 'closed', 'cancelled'].includes(group.status) || !['entry', 'position-snapshot'].includes(group.owner) || typeof group.extendedHours !== 'boolean' || group.parentOrderId !== null && !orders.has(group.parentOrderId)) throw new Error('Invalid exit group identity.');
    if (!Number.isSafeInteger(group.sequence) || group.sequence < 1 || !Number.isSafeInteger(group.createdAt) || group.createdAt < account.createdAt || group.createdAt > account.clock || !Number.isFinite(group.initialQuantity) || group.initialQuantity <= 0 || group.status === 'active' && book.generations[group.instrument.id] !== group.generation) throw new Error('Invalid exit group time, exposure or generation.');
    if (group.sessionPolicy !== undefined && validatePaperSessionPolicy(group.sessionPolicy).entryOutsideRth !== group.extendedHours) throw new Error('Exit group session policy contradicts its canonical eligibility.');
    if (group.owner === 'entry') {
      const parent = group.parentOrderId ? orders.get(group.parentOrderId) : undefined, fill = parent ? fillsByOrder.get(parent.id) : undefined;
      if (!parent || !fill || parent.bracket || parent.status !== 'filled' || parent.side !== group.direction || paperInstrumentKey(parent.instrument) !== group.instrumentKey || openings.get(fill.id) !== group.initialQuantity || fill.at !== group.createdAt) throw new Error('Exit group is not owned by its opening parent.');
      if (group.extendedHours !== (parent.extendedHours ?? false)) throw new Error('Exit group canonical eligibility differs from its parent.');
      if (JSON.stringify(group.sessionPolicy ?? null) !== JSON.stringify(parent.sessionPolicy ?? null)) throw new Error('Exit group session policy differs from its parent.');
    } else if (group.parentOrderId !== null) throw new Error('Position snapshot must not claim an entry parent.');
    validatePaperExitPlan({ schemaVersion: 1, mode: group.mode, levels: group.levels.map(level => ({ quantity: level.requestedQuantity, ...(level.takeProfit === undefined ? {} : { takeProfit: level.takeProfit }), ...(level.stopLoss === undefined ? {} : { stopLoss: level.stopLoss }) })) }, group.instrument, group.direction);
    const allocated = group.levels.reduce((sum, level) => sum.add(level.allocation), new D(0));
    if (allocated.gt(capacities.get(group.id) ?? 0)) throw new Error('Exit allocation exceeds owned exposure.');
    const expectedAllocations = allocatePaperExitLevels(group.levels.map(level => level.status === 'active' ? new D(level.requestedQuantity).sub(level.filledQuantity).toNumber() : 0), capacities.get(group.id)?.toNumber() ?? 0, group.instrument.lotSize);
    group.levels.forEach((level, index) => {
      keys(level, ['id', 'ordinal', 'requestedQuantity', ...(level.takeProfit === undefined ? [] : ['takeProfit']), ...(level.stopLoss === undefined ? [] : ['stopLoss']), 'filledQuantity', 'allocation', 'status', 'childIds', 'activationSequence', 'revision']); register(level.id, 'level');
      if (level.ordinal !== index || !Number.isSafeInteger(level.revision) || level.revision < 1 || !['active', 'filled', 'cancelled'].includes(level.status) || !Number.isFinite(level.filledQuantity) || level.filledQuantity < 0 || level.filledQuantity > level.requestedQuantity || !Number.isFinite(level.allocation) || level.allocation < 0 || level.allocation > level.requestedQuantity || !Number.isSafeInteger(level.activationSequence) || level.activationSequence < -1) throw new Error('Invalid exit level state.');
      if (level.allocation !== expectedAllocations[index].allocatedQuantity || group.status !== 'active' && level.status === 'active' || level.status !== 'active' && level.allocation !== 0 || new Set(level.childIds).size !== level.childIds.length) throw new Error('Exit level priority or terminal state is inconsistent.');
      const activeLegs = new Set<string>(); let filledChildren = 0;
      for (const childId of level.childIds) {
        const child = orders.get(childId);
        if (!child || !child.reduceOnly || child.bracket?.groupId !== group.id || child.bracket.levelId !== level.id || child.bracket.generation !== group.generation || paperInstrumentKey(child.instrument) !== group.instrumentKey || child.side === group.direction) throw new Error('Invalid OCO child ownership.');
        keys(child.bracket, ['groupId', 'levelId', 'leg', 'generation', 'activationSequence']);
        const extendedHours = group.sessionPolicy ? child.bracket.leg === 'tp' && group.sessionPolicy.takeProfitOutsideRth : group.extendedHours;
        if (!['tp', 'sl'].includes(child.bracket.leg) || child.type !== (child.bracket.leg === 'tp' ? 'limit' : 'stop') || child.bracket.leg === 'tp' && child.stopPrice !== undefined || child.bracket.leg === 'sl' && child.limitPrice !== undefined || child.timeInForce !== 'GTC' || child.expiresAt !== undefined || child.sessionPolicy !== undefined || child.extendedHours !== extendedHours || !Number.isSafeInteger(child.bracket.activationSequence) || child.bracket.activationSequence < -1 || child.bracket.activationSequence > level.activationSequence) throw new Error('Child order type, execution policy or barrier contradicts its exit leg.');
        if (working(child)) {
          if (group.status !== 'active' || level.status !== 'active' || child.quantity !== level.allocation || level.allocation <= 0 || activeLegs.has(child.bracket.leg) || child.bracket.activationSequence !== level.activationSequence || (child.bracket.leg === 'tp' ? child.limitPrice !== level.takeProfit : child.stopPrice !== level.stopLoss)) throw new Error('Invalid active OCO price, barrier or allocation.');
          activeLegs.add(child.bracket.leg);
        }
        if (child.status === 'filled') { const fill = fillsByOrder.get(child.id); if (++filledChildren > 1 || level.status !== 'filled' || child.filledQuantity !== level.filledQuantity || !fill || fill.quoteSequence <= child.bracket.activationSequence) throw new Error('OCO fill disagrees with its level or activation event.'); }
      }
      if ((level.status === 'filled') !== (filledChildren === 1)) throw new Error('Exit terminal state disagrees with child fill history.');
      if (level.status === 'active' && level.allocation > 0 && (level.takeProfit !== undefined && !activeLegs.has('tp') || level.stopLoss !== undefined && !activeLegs.has('sl'))) throw new Error('Active exit is missing a promised child.');
    });
  }
  for (const order of account.orders) {
    if (order.bracket && !groupMap.get(order.bracket.groupId)?.levels.some(level => level.id === order.bracket!.levelId && level.childIds.includes(order.id))) throw new Error('Order has an orphaned exit link.');
    if (order.exits && working(order) && !book.pending[order.id]) throw new Error('Working parent has lost its exit plan.');
    if (order.submissionSequence !== undefined && order.submissionSequence !== Number(order.id.split(':').at(-1))) throw new Error('Virtual submission queue identity was changed.');
  }
}
