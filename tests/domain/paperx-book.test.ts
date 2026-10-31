import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, restorePaperAccount, type PaperAccount } from '../../src/domain/paper';
import { PAPER_BOOK_LIMITS, PAPER_STORAGE_FULL_MESSAGE, createBookAccount, deleteBookAccount, guardPaperStorage, listBookAccounts, paperStorageBytes, renameBookAccount, restorePaperState, selectBookAccount, serializePaperState, setOrdersColumns, type PaperState } from '../../src/domain/paper-book';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'T:B', symbol: 'B', name: 'Synthetic book test', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (sequence = 1): Quote => ({ instrumentId: instrument.id, bid: 9.99, ask: 10.01, eventTime: 1, receivedAt: 1, availableAt: 1, sequence, session: 'regular', fixture: true });
const withFill = (account = createPaperAccount({ now: 0 })) => submitPaperOrder(processPaperQuote(account, quote(), 1).account, { instrument, side: 'buy', type: 'market', quantity: 5 }, 1).account;
let counter = 0;
const ids = () => `acct-${++counter}`;
const base = (): PaperState => ({ paper: withFill(), book: null });
const created = (state: PaperState, name: string, extra: { initialBalance?: number; currency?: string } = {}) => { const result = createBookAccount(state, { name, ...extra }, 5, ids); if (!result.ok) throw new Error(result.message); return result.state; };

describe('storage of the book', () => {
  it('a workspace saved before the lane (no paperBook) restores byte-identically and writes no new key', () => {
    const old = withFill(); const text = JSON.stringify(old);
    const state = restorePaperState(JSON.parse(text), undefined);
    expect(JSON.stringify(state.paper)).toBe(text);
    expect(state.book).toBeNull();
    expect(serializePaperState(state)).toEqual({ paper: JSON.parse(text) });
    expect(JSON.stringify(serializePaperState(state).paper)).toBe(text);
  });
  it('paper stays the active account with unchanged bytes while another account is added', () => {
    const state = base(); const before = JSON.stringify(state.paper);
    const next = created(state, 'Second');
    expect(JSON.stringify(next.paper)).toBe(before);
    expect(next.book!.inactive.map(row => row.name)).toEqual(['Second']);
    expect(Object.keys(next.book!).sort()).toEqual(['activeId', 'inactive', 'schemaVersion']);
    expect(next.book!.activeId).toBe(next.paper.id);
    const saved = serializePaperState(next);
    expect(Object.keys(saved).sort()).toEqual(['paper', 'paperBook']);
  });
  it('round-trips a book through the validator', () => {
    const next = created(base(), 'Second', { initialBalance: 5000, currency: 'EUR' });
    const saved = JSON.parse(JSON.stringify(serializePaperState(next)));
    const restored = restorePaperState(saved.paper, saved.paperBook);
    expect(restored.paper).toEqual(next.paper); expect(restored.book).toEqual(next.book);
    expect(restored.book!.inactive[0].settings).toMatchObject({ initialBalance: 5000, currency: 'EUR' });
  });
  it('an older build that edited paper and kept paperBook loses no fill and re-points activeId', () => {
    const next = created(base(), 'Second');
    const saved = JSON.parse(JSON.stringify(serializePaperState(next)));
    const edited = processPaperQuote(restorePaperAccount(saved.paper), quote(2), 2).account;
    const afterOld = submitPaperOrder(edited, { instrument, side: 'buy', type: 'market', quantity: 1 }, 2).account;
    const restored = restorePaperState(afterOld, saved.paperBook);
    expect(restored.paper.fills.length).toBe(2);
    expect(restored.book!.activeId).toBe(restored.paper.id);
    expect(restored.book!.inactive).toHaveLength(1);
    expect(restored.repointed).toBe(false);
    const differing = { ...saved.paperBook, activeId: 'stale-active-id' };
    const second = restorePaperState(afterOld, differing);
    expect(second.paper.id).toBe(afterOld.id); expect(second.book!.activeId).toBe(afterOld.id); expect(second.book!.inactive).toHaveLength(1); expect(second.repointed).toBe(true);
  });
  it('refuses a malformed book without touching paper', () => {
    const paper = withFill();
    expect(() => restorePaperState(paper, { schemaVersion: 1, activeId: paper.id, inactive: [], extra: 1 })).toThrow(/unsupported/i);
    expect(() => restorePaperState(paper, { schemaVersion: 2, activeId: paper.id, inactive: [] })).toThrow();
    expect(() => restorePaperState(paper, { schemaVersion: 1, activeId: paper.id, inactive: [paper] })).toThrow(/duplicate|unique/i);
    expect(() => restorePaperState(paper, { schemaVersion: 1, activeId: paper.id, inactive: [{ ...paper, id: 'x', mode: 'replay-paper' }] })).toThrow();
    expect(() => restorePaperState(paper, { schemaVersion: 1, activeId: paper.id, inactive: [{ ...paper, id: 'x' }] })).toThrow();
    const many = Array.from({ length: PAPER_BOOK_LIMITS.accounts }, (_, index) => createPaperAccount({ id: `n${index}`, now: 0 }));
    expect(() => restorePaperState(paper, { schemaVersion: 1, activeId: paper.id, inactive: many })).toThrow(/20/);
  });
});

describe('create, select, rename, delete', () => {
  it('CREATE validates the name and gives a fresh identity with empty history', () => {
    const state = base();
    expect(createBookAccount(state, { name: '  ' }, 5, ids)).toMatchObject({ ok: false });
    expect(createBookAccount(state, { name: 'x'.repeat(65) }, 5, ids)).toMatchObject({ ok: false });
    const next = created(state, 'Swing');
    const account = next.book!.inactive[0];
    expect(account).toMatchObject({ name: 'Swing', mode: 'paper', virtual: true, orders: [], fills: [], positions: {} });
    expect(account.id).not.toBe(next.paper.id); expect(account.runId).not.toBe(next.paper.runId);
    expect(account.settings).toMatchObject({ initialBalance: 100000, currency: 'USD', leverage: 1 });
    expect(createBookAccount(next, { name: 'swing' }, 5, ids)).toMatchObject({ ok: false, message: expect.stringMatching(/already/i) });
    expect(createBookAccount(next, { name: state.paper.name.toUpperCase() }, 5, ids)).toMatchObject({ ok: false });
  });
  it('CURRENCY_CREATE accepts any three-letter upper-case code and refuses others', () => {
    const state = base();
    expect(createBookAccount(state, { name: 'a', currency: 'eur' }, 5, ids)).toMatchObject({ ok: false });
    expect(createBookAccount(state, { name: 'a', currency: 'EURO' }, 5, ids)).toMatchObject({ ok: false });
    expect(created(state, 'a', { currency: 'JPY' }).book!.inactive[0].settings.currency).toBe('JPY');
    expect(created(state, 'b').book!.inactive[0].settings.currency).toBe('USD');
    expect(createBookAccount(state, { name: 'c', initialBalance: -1 }, 5, ids)).toMatchObject({ ok: false });
  });
  it('limits the book to 20 accounts', () => {
    let state = base();
    for (let index = 1; index < PAPER_BOOK_LIMITS.accounts; index++) state = created(state, `Account ${index}`);
    expect(listBookAccounts(state)).toHaveLength(20);
    expect(createBookAccount(state, { name: 'One too many' }, 5, ids)).toMatchObject({ ok: false, message: expect.stringMatching(/20/) });
  });
  it('SELECT swaps paper with the chosen entry in one change and keeps every account intact', () => {
    const start = created(base(), 'Second'); const other = start.book!.inactive[0];
    const result = selectBookAccount(start, other.id); if (!result.ok) throw new Error(result.message);
    const next = result.state;
    expect(next.paper).toBe(other);
    expect(next.book!.activeId).toBe(other.id);
    expect(next.book!.inactive).toEqual([start.paper]);
    expect(listBookAccounts(next).map(row => [row.name, row.active])).toEqual([[other.name, true], [start.paper.name, false]]);
    expect(selectBookAccount(next, 'missing')).toMatchObject({ ok: false });
    expect(selectBookAccount(next, other.id)).toMatchObject({ ok: true });
  });
  it('RENAME changes only the name', () => {
    const start = created(base(), 'Second'); const target = start.book!.inactive[0];
    const result = renameBookAccount(start, target.id, 'Renamed'); if (!result.ok) throw new Error(result.message);
    expect(result.state.book!.inactive[0]).toEqual({ ...target, name: 'Renamed' });
    const active = renameBookAccount(start, start.paper.id, 'Main'); if (!active.ok) throw new Error(active.message);
    expect(active.state.paper).toEqual({ ...start.paper, name: 'Main' });
    expect(active.state.paper.fills).toEqual(start.paper.fills); expect(active.state.paper.runId).toBe(start.paper.runId); expect(active.state.paper.id).toBe(start.paper.id);
    expect(renameBookAccount(start, target.id, start.paper.name)).toMatchObject({ ok: false });
    expect(renameBookAccount(start, target.id, 'Second')).toMatchObject({ ok: true });
  });
  it('DELETE refuses the last account and moves the first inactive entry into paper when the active one goes', () => {
    expect(deleteBookAccount(base(), base().paper.id)).toMatchObject({ ok: false, message: 'Keep at least one virtual account' });
    const two = created(base(), 'Second'); const second = two.book!.inactive[0];
    const dropActive = deleteBookAccount(two, two.paper.id); if (!dropActive.ok) throw new Error(dropActive.message);
    expect(dropActive.state.paper).toBe(second); expect(dropActive.state.book).toBeNull();
    const dropOther = deleteBookAccount(two, second.id); if (!dropOther.ok) throw new Error(dropOther.message);
    expect(dropOther.state.paper).toBe(two.paper); expect(dropOther.state.book).toBeNull();
    expect(deleteBookAccount(two, 'missing')).toMatchObject({ ok: false });
  });
  it('keeps presets and column settings when the last extra account goes', () => {
    const two = created(base(), 'Second');
    const columns = setOrdersColumns(two, { expiry: false });
    const dropOther = deleteBookAccount(columns, two.book!.inactive[0].id); if (!dropOther.ok) throw new Error(dropOther.message);
    expect(dropOther.state.book).toEqual({ schemaVersion: 1, activeId: two.paper.id, inactive: [], ordersColumns: { expiry: false } });
    expect(Object.keys(serializePaperState(dropOther.state)).sort()).toEqual(['paper', 'paperBook']);
  });
});

describe('storage cap', () => {
  it('measures paper plus paperBook and refuses growth beyond the cap with the stated message', () => {
    expect(PAPER_BOOK_LIMITS.bytes).toBe(16 * 1024 * 1024);
    expect(PAPER_STORAGE_FULL_MESSAGE).toBe('Virtual account storage is full. Delete an account or reset history.');
    const state = created(base(), 'Second'), bytes = paperStorageBytes(state);
    expect(bytes).toBe(new TextEncoder().encode(JSON.stringify(serializePaperState(state))).byteLength);
    const grown = submitPaperOrder(state.paper, { instrument, side: 'buy', type: 'market', quantity: 1 }, 1).account;
    expect(guardPaperStorage(state, grown)).toEqual({ ok: true });
    expect(guardPaperStorage(state, grown, bytes)).toEqual({ ok: false, message: PAPER_STORAGE_FULL_MESSAGE });
    expect(createBookAccount(state, { name: 'Third' }, 5, ids, bytes)).toEqual({ ok: false, message: PAPER_STORAGE_FULL_MESSAGE });
  });
  it('lets a change that shrinks storage through even above the cap', () => {
    const state = created(base(), 'Second'), bytes = paperStorageBytes(state);
    const smaller = createPaperAccount({ id: state.paper.id, name: state.paper.name, runId: state.paper.runId, now: 0 });
    expect(guardPaperStorage(state, smaller, bytes - 1000)).toEqual({ ok: true });
    expect(guardPaperStorage(state, state.paper, 10)).toEqual({ ok: true });
  });
});
