import { createPaperAccount, validatePaperAccount, restorePaperAccount, type PaperAccount } from './paper';
import { validatePaperPresets, type PaperPreset } from './paper-presets';

/**
 * Multiple virtual accounts. The workspace key `paper` stays the single authority for the ACTIVE account (unchanged key and
 * bytes). The optional `paperBook` key holds only the OTHER accounts, plus presets and the Orders column setting. An absent
 * book means one account, so a workspace saved before this feature restores and re-saves byte-identically.
 */
export const PAPER_BOOK_LIMITS = { accounts: 20, bytes: 16 * 1024 * 1024, nameCharacters: 64 } as const;
export const PAPER_STORAGE_FULL_MESSAGE = 'Virtual account storage is full. Delete an account or reset history.';
export interface PaperOrdersColumns { expiry: boolean; }
export interface PaperBook { schemaVersion: 1; activeId: string; inactive: PaperAccount[]; presets?: PaperPreset[]; ordersColumns?: PaperOrdersColumns; }
export interface PaperState { paper: PaperAccount; book: PaperBook | null; }
export type PaperBookResult = { ok: true; state: PaperState } | { ok: false; message: string };
export interface PaperAccountRow { id: string; name: string; currency: string; active: boolean; }

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const keyOf = (name: string) => name.trim().toLowerCase();

/** Drops the book entirely when it carries nothing beyond the single active account, so single-account saves stay unchanged. */
function normalize(paper: PaperAccount, book: PaperBook | null): PaperState {
  if (!book) return { paper, book: null };
  const next: PaperBook = { ...book, activeId: paper.id };
  if (!next.inactive.length && !next.presets?.length && next.ordersColumns === undefined) return { paper, book: null };
  if (next.presets && !next.presets.length) delete next.presets;
  return { paper, book: next };
}
export function listBookAccounts(state: PaperState): PaperAccountRow[] {
  return [state.paper, ...(state.book?.inactive ?? [])].map((account, index) => ({ id: account.id, name: account.name, currency: account.settings.currency, active: index === 0 }));
}
/** The JSON stored in the workspace: `paper` always, `paperBook` only when it holds something. */
export function serializePaperState(state: PaperState): { paper: PaperAccount; paperBook?: PaperBook } {
  return state.book ? { paper: state.paper, paperBook: state.book } : { paper: state.paper };
}
export function paperStorageBytes(state: PaperState): number { return new TextEncoder().encode(JSON.stringify(serializePaperState(state))).byteLength; }
/**
 * Refuses a change that would push total paper storage past the cap, unless it does not grow storage (so history can always be
 * shrunk). `nextPaper` replaces the active account for the measurement.
 */
export function guardPaperStorage(state: PaperState, nextPaper: PaperAccount, capBytes: number = PAPER_BOOK_LIMITS.bytes): { ok: true } | { ok: false; message: string } {
  const after = paperStorageBytes({ paper: nextPaper, book: state.book });
  if (after <= capBytes || after <= paperStorageBytes(state)) return { ok: true };
  return fail(PAPER_STORAGE_FULL_MESSAGE);
}

/** Storage cap for a whole-state change (accounts, presets, columns): refuses growth past the cap, always lets shrinking through. */
export function guardPaperState(previous: PaperState, next: PaperState, capBytes: number = PAPER_BOOK_LIMITS.bytes): { ok: true } | { ok: false; message: string } {
  const after = paperStorageBytes(next);
  return after <= capBytes || after <= paperStorageBytes(previous) ? { ok: true } : fail(PAPER_STORAGE_FULL_MESSAGE);
}

function validateName(state: PaperState, name: string, exceptId: string | null): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > PAPER_BOOK_LIMITS.nameCharacters) return 'Account names need 1 to 64 characters.';
  if (listBookAccounts(state).some(row => row.id !== exceptId && keyOf(row.name) === keyOf(trimmed))) return 'An account with this name already exists.';
  return null;
}
export interface CreateBookAccountInput { name: string; initialBalance?: number; currency?: string; }
/** CREATE: a fresh local account with its own orders, positions, history and settings, added to the inactive list. */
export function createBookAccount(state: PaperState, input: CreateBookAccountInput, now: number, idFactory: () => string = () => `paper-${crypto.randomUUID()}`, capBytes: number = PAPER_BOOK_LIMITS.bytes): PaperBookResult {
  const problem = validateName(state, input.name, null); if (problem) return fail(problem);
  if (listBookAccounts(state).length >= PAPER_BOOK_LIMITS.accounts) return fail('At most 20 virtual accounts are kept. Delete one first.');
  let account: PaperAccount;
  try {
    const id = idFactory();
    account = createPaperAccount({ id, name: input.name.trim(), runId: `paper:run:${id}`, now, ...(input.initialBalance === undefined ? {} : { initialBalance: input.initialBalance }), ...(input.currency === undefined ? {} : { currency: input.currency }) });
  } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
  if (listBookAccounts(state).some(row => row.id === account.id)) return fail('That account identity is already in use.');
  const book: PaperBook = { ...(state.book ?? { schemaVersion: 1, activeId: state.paper.id, inactive: [] }), inactive: [...(state.book?.inactive ?? []), account] };
  const next = normalize(state.paper, book);
  if (paperStorageBytes(next) > capBytes) return fail(PAPER_STORAGE_FULL_MESSAGE);
  return { ok: true, state: next };
}
/** SELECT: one state change swaps `paper` with the chosen inactive entry. */
export function selectBookAccount(state: PaperState, id: string): PaperBookResult {
  if (id === state.paper.id) return { ok: true, state };
  const chosen = state.book?.inactive.find(row => row.id === id);
  if (!state.book || !chosen) return fail('That virtual account is no longer available.');
  return { ok: true, state: normalize(chosen, { ...state.book, activeId: chosen.id, inactive: state.book.inactive.map(row => row === chosen ? state.paper : row) }) };
}
/** RENAME: changes the name only. Identity, run and history are untouched. */
export function renameBookAccount(state: PaperState, id: string, name: string): PaperBookResult {
  const problem = validateName(state, name, id); if (problem) return fail(problem);
  if (id === state.paper.id) return { ok: true, state: normalize({ ...state.paper, name: name.trim() }, state.book) };
  const target = state.book?.inactive.find(row => row.id === id);
  if (!state.book || !target) return fail('That virtual account is no longer available.');
  return { ok: true, state: normalize(state.paper, { ...state.book, inactive: state.book.inactive.map(row => row === target ? { ...row, name: name.trim() } : row) }) };
}
/** DELETE: the last account cannot go; deleting the active one moves the first inactive entry into `paper`. */
export function deleteBookAccount(state: PaperState, id: string): PaperBookResult {
  if (listBookAccounts(state).length <= 1) return fail('Keep at least one virtual account');
  if (id === state.paper.id) {
    const [first, ...rest] = state.book!.inactive;
    return { ok: true, state: normalize(first, { ...state.book!, activeId: first.id, inactive: rest }) };
  }
  const target = state.book?.inactive.find(row => row.id === id);
  if (!state.book || !target) return fail('That virtual account is no longer available.');
  return { ok: true, state: normalize(state.paper, { ...state.book, inactive: state.book.inactive.filter(row => row !== target) }) };
}
export function setOrdersColumns(state: PaperState, columns: PaperOrdersColumns): PaperState {
  const book: PaperBook = { ...(state.book ?? { schemaVersion: 1, activeId: state.paper.id, inactive: [] }), ordersColumns: { expiry: columns.expiry } };
  return normalize(state.paper, book);
}
export function setBookPresets(state: PaperState, presets: PaperPreset[]): PaperState {
  const book: PaperBook = { ...(state.book ?? { schemaVersion: 1, activeId: state.paper.id, inactive: [] }), presets: presets.map(row => structuredClone(row)) };
  if (!presets.length) delete book.presets;
  return normalize(state.paper, book);
}
/** Absent means visible, so today's always-visible Expiry column is the default. */
export function ordersColumnsOf(state: PaperState): PaperOrdersColumns { return { expiry: state.book?.ordersColumns?.expiry ?? true }; }

export const PAPER_BOOK_QUARANTINE_NOTICE = 'The saved account book could not be read. It was set aside unchanged and your active account was kept.';
export type SafePaperState = PaperState & { repointed: boolean; quarantined: { raw: unknown; reason: string } | null; notice: string | null };
/**
 * Load path: a damaged paperBook must never block the workspace. The active `paper` account is validated exactly as before (a damaged
 * paper still throws, as it always did). A damaged book is set aside: the pair loads with no book, the raw value is returned so the
 * host can keep it unchanged, and a visible notice is supplied. The `paper` bytes are untouched.
 */
export function restorePaperStateSafe(paperInput: unknown, bookInput: unknown): SafePaperState {
  try { const state = restorePaperState(paperInput, bookInput); return { ...state, quarantined: null, notice: null }; }
  catch (error) {
    const paper = restorePaperAccount(paperInput);
    return { paper, book: null, repointed: false, quarantined: { raw: bookInput, reason: error instanceof Error ? error.message : String(error) }, notice: PAPER_BOOK_QUARANTINE_NOTICE };
  }
}

const BOOK_KEYS = ['schemaVersion', 'activeId', 'inactive', 'presets', 'ordersColumns'];
/**
 * Restores the saved pair. `paper` is validated exactly as before and stays active. When the saved activeId differs from paper.id
 * (an older build replaced the account), paper stays active and the book is re-pointed with no account dropped.
 */
export function restorePaperState(paperInput: unknown, bookInput: unknown): PaperState & { repointed: boolean } {
  const paper = restorePaperAccount(paperInput);
  if (bookInput === undefined || bookInput === null) return { paper, book: null, repointed: false };
  if (typeof bookInput !== 'object' || Array.isArray(bookInput)) throw new Error('The saved account book is malformed.');
  const raw = bookInput as Record<string, unknown>, keys = Object.keys(raw);
  if (keys.some(key => !BOOK_KEYS.includes(key)) || !['schemaVersion', 'activeId', 'inactive'].every(key => keys.includes(key))) throw new Error('The saved account book has missing or unsupported fields.');
  if (raw.schemaVersion !== 1 || typeof raw.activeId !== 'string' || !Array.isArray(raw.inactive)) throw new Error('The saved account book version is not supported.');
  if (raw.inactive.length + 1 > PAPER_BOOK_LIMITS.accounts) throw new Error('At most 20 virtual accounts are kept.');
  const ids = new Set<string>([paper.id]);
  const inactive = raw.inactive.map(item => {
    const checked = validatePaperAccount(item);
    if (!checked.ok || !checked.account) throw new Error('A saved inactive account is invalid: ' + checked.errors.join(' '));
    const account = checked.account;
    if (account.mode !== 'paper' || account.virtual !== true) throw new Error('Inactive accounts must be ordinary local virtual accounts.');
    if (ids.has(account.id)) throw new Error('Virtual account identities must be unique.');
    ids.add(account.id); return account;
  });
  const book: PaperBook = { schemaVersion: 1, activeId: paper.id, inactive };
  if (raw.presets !== undefined) book.presets = validatePaperPresets(raw.presets);
  if (raw.ordersColumns !== undefined) {
    const columns = raw.ordersColumns as Record<string, unknown>;
    if (!columns || typeof columns !== 'object' || Array.isArray(columns) || Object.keys(columns).length !== 1 || typeof columns.expiry !== 'boolean') throw new Error('The saved Orders column setting is malformed.');
    book.ordersColumns = { expiry: columns.expiry };
  }
  return { paper, book, repointed: raw.activeId !== paper.id };
}
