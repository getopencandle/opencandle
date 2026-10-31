// Portfolio model. Manual transactions (or a one-way paper-book import) -> holdings (average-cost method), cash, PnL.
// Everything here is our own choice and virtual: no broker, no account, no real money. Pure functions; the dialog owns the state.
import type { BarDataset } from '../domain/types';

export type PortfolioTxType = 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'dividend' | 'fee';
export const PORTFOLIO_TX_TYPES: readonly PortfolioTxType[] = ['buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'fee'];
export const PORTFOLIO_TX_LABELS: Record<PortfolioTxType, string> = { buy: 'Buy', sell: 'Sell', deposit: 'Deposit', withdrawal: 'Withdrawal', dividend: 'Dividend', fee: 'Fee' };
export const PORTFOLIO_COST_METHOD_LABEL = 'Average cost: fees are added to the cost of a buy and deducted from the proceeds of a sell.';
export const PORTFOLIO_LIMITS = { portfolios: 20, transactions: 5000, nameCharacters: 64, noteCharacters: 200 } as const;
export const PORTFOLIO_NOTICE = 'Virtual record keeping only. Nothing here is a broker account, and no real money moves.';
const EPS = 1e-9;

export interface PortfolioTx {
  id: string; type: PortfolioTxType;
  /** Seconds since the Unix epoch (UTC). */
  time: number;
  symbol?: string; quantity?: number; price?: number;
  /** Cash amount for deposit, withdrawal, dividend and fee (always positive). */
  amount?: number;
  /** Trade fee (buy and sell only, never negative). */
  fee?: number; note?: string; source: 'manual' | 'csv' | 'paper';
}
export type PortfolioRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
export const PORTFOLIO_RANGES: readonly PortfolioRange[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
export interface Portfolio { id: string; name: string; currency: string; createdAt: number; transactions: PortfolioTx[]; showSold: boolean; benchmark: string | null; range: PortfolioRange; }
export type PortfolioTab = 'overview' | 'holdings' | 'transactions' | 'analytics';
export const PORTFOLIO_TABS: readonly PortfolioTab[] = ['overview', 'holdings', 'transactions', 'analytics'];
export interface PortfolioState { schemaVersion: 1; portfolios: Portfolio[]; activeId: string | null; tab: PortfolioTab; }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function createPortfolioState(): PortfolioState { return { schemaVersion: 1, portfolios: [], activeId: null, tab: 'overview' }; }
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const cleanSymbol = (value: unknown) => cleanText(value, 24).toUpperCase().replace(/\s+/g, '');
let counter = 0;
export function portfolioId(prefix: string): string { counter += 1; return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

/** Validates one transaction input. A trade needs symbol, quantity > 0 and price >= 0; cash types need amount > 0. */
export function normalizeTransaction(input: unknown, source: PortfolioTx['source'] = 'manual'): Result<PortfolioTx> {
  if (!isObject(input)) return { ok: false, error: 'Transaction is not an object.' };
  const type = input.type as PortfolioTxType;
  if (!PORTFOLIO_TX_TYPES.includes(type)) return { ok: false, error: 'Choose a transaction type.' };
  if (!finite(input.time) || input.time < 0 || input.time > 4102444800) return { ok: false, error: 'Enter a valid date.' };
  const base: PortfolioTx = { id: typeof input.id === 'string' && input.id ? input.id.slice(0, 80) : portfolioId('tx'), type, time: Math.floor(input.time), source: input.source === 'csv' || input.source === 'paper' ? input.source : source };
  const note = cleanText(input.note, PORTFOLIO_LIMITS.noteCharacters); if (note) base.note = note;
  if (type === 'buy' || type === 'sell') {
    const symbol = cleanSymbol(input.symbol);
    if (!symbol) return { ok: false, error: 'Enter a symbol.' };
    if (!finite(input.quantity) || input.quantity <= 0) return { ok: false, error: 'Quantity must be greater than zero.' };
    if (!finite(input.price) || input.price < 0) return { ok: false, error: 'Price must be zero or more.' };
    const fee = input.fee === undefined || input.fee === null ? 0 : input.fee;
    if (!finite(fee) || fee < 0) return { ok: false, error: 'Fee must be zero or more.' };
    return { ok: true, value: { ...base, symbol, quantity: input.quantity, price: input.price, ...(fee ? { fee } : {}) } };
  }
  if (!finite(input.amount) || input.amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
  const symbol = cleanSymbol(input.symbol);
  return { ok: true, value: { ...base, amount: input.amount, ...(type === 'dividend' && symbol ? { symbol } : {}) } };
}

export const sortTransactions = (rows: readonly PortfolioTx[]): PortfolioTx[] => rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.time - b.row.time || a.index - b.index).map(entry => entry.row);

/** The running book after applying a time-ordered transaction list. */
export interface Book {
  cash: number; deposits: number; withdrawals: number; dividends: number;
  /** Trade fees plus stand-alone fee entries. */
  feesPaid: number;
  /** Stand-alone fee entries only (trade fees are already inside realized and cost). */
  otherFees: number; realized: number;
  lots: Map<string, { quantity: number; cost: number; lastPrice: number; realized: number }>;
}
export function newBook(): Book { return { cash: 0, deposits: 0, withdrawals: 0, dividends: 0, feesPaid: 0, otherFees: 0, realized: 0, lots: new Map() }; }
/** Applies one transaction. Returns an error string when it would sell more than is held. */
export function applyTransaction(book: Book, tx: PortfolioTx): string | null {
  if (tx.type === 'deposit') { book.cash += tx.amount!; book.deposits += tx.amount!; return null; }
  if (tx.type === 'withdrawal') { book.cash -= tx.amount!; book.withdrawals += tx.amount!; return null; }
  if (tx.type === 'dividend') { book.cash += tx.amount!; book.dividends += tx.amount!; return null; }
  if (tx.type === 'fee') { book.cash -= tx.amount!; book.feesPaid += tx.amount!; book.otherFees += tx.amount!; return null; }
  const symbol = tx.symbol!, qty = tx.quantity!, price = tx.price!, fee = tx.fee ?? 0;
  const lot = book.lots.get(symbol) ?? { quantity: 0, cost: 0, lastPrice: price, realized: 0 };
  if (tx.type === 'buy') {
    lot.quantity += qty; lot.cost += qty * price + fee; lot.lastPrice = price; book.cash -= qty * price + fee; book.feesPaid += fee; book.lots.set(symbol, lot); return null;
  }
  if (qty > lot.quantity + EPS) return `Cannot sell ${qty} ${symbol}: only ${Math.max(0, lot.quantity)} held at that date.`;
  const average = lot.quantity > 0 ? lot.cost / lot.quantity : 0, gain = qty * price - fee - qty * average;
  lot.quantity -= qty; lot.cost -= qty * average; lot.lastPrice = price; lot.realized += gain; book.realized += gain; book.cash += qty * price - fee; book.feesPaid += fee;
  if (lot.quantity < EPS) { lot.quantity = 0; lot.cost = 0; }
  book.lots.set(symbol, lot); return null;
}
export function replay(rows: readonly PortfolioTx[], until = Infinity): { ok: true; book: Book } | { ok: false; error: string } {
  const book = newBook();
  for (const tx of rows) { if (tx.time > until) break; const error = applyTransaction(book, tx); if (error) return { ok: false, error }; }
  return { ok: true, book };
}

export function restorePortfolio(input: unknown): Portfolio | null {
  if (!isObject(input) || typeof input.id !== 'string' || !input.id) return null;
  const name = cleanText(input.name, PORTFOLIO_LIMITS.nameCharacters); if (!name) return null;
  const transactions: PortfolioTx[] = [];
  if (Array.isArray(input.transactions)) for (const row of input.transactions.slice(0, PORTFOLIO_LIMITS.transactions)) { const tx = normalizeTransaction(row); if (tx.ok) transactions.push(tx.value); }
  const range = PORTFOLIO_RANGES.includes(input.range as PortfolioRange) ? input.range as PortfolioRange : 'ALL';
  const sorted = sortTransactions(transactions);
  return { id: input.id.slice(0, 80), name, currency: cleanText(input.currency, 8).toUpperCase() || 'USD', createdAt: finite(input.createdAt) ? input.createdAt : 0, transactions: replay(sorted).ok ? sorted : [], showSold: input.showSold === true, benchmark: typeof input.benchmark === 'string' && input.benchmark ? cleanSymbol(input.benchmark) || null : null, range };
}
export function restorePortfolioState(input: unknown): PortfolioState {
  const state = createPortfolioState(); if (!isObject(input)) return state;
  const seen = new Set<string>();
  if (Array.isArray(input.portfolios)) for (const row of input.portfolios.slice(0, PORTFOLIO_LIMITS.portfolios)) { const item = restorePortfolio(row); if (item && !seen.has(item.id)) { seen.add(item.id); state.portfolios.push(item); } }
  state.activeId = typeof input.activeId === 'string' && seen.has(input.activeId) ? input.activeId : state.portfolios[0]?.id ?? null;
  if (PORTFOLIO_TABS.includes(input.tab as PortfolioTab)) state.tab = input.tab as PortfolioTab;
  return state;
}
export const activePortfolio = (state: PortfolioState): Portfolio | null => state.portfolios.find(item => item.id === state.activeId) ?? null;

export function createPortfolio(state: PortfolioState, name: string, currency = 'USD', now = Math.floor(Date.now() / 1000)): Result<PortfolioState> {
  const clean = cleanText(name, PORTFOLIO_LIMITS.nameCharacters);
  if (!clean) return { ok: false, error: 'Enter a portfolio name.' };
  if (state.portfolios.length >= PORTFOLIO_LIMITS.portfolios) return { ok: false, error: `A workspace keeps at most ${PORTFOLIO_LIMITS.portfolios} portfolios.` };
  if (state.portfolios.some(item => item.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: 'A portfolio with that name already exists.' };
  const item: Portfolio = { id: portfolioId('pf'), name: clean, currency: cleanText(currency, 8).toUpperCase() || 'USD', createdAt: now, transactions: [], showSold: false, benchmark: null, range: 'ALL' };
  return { ok: true, value: { ...state, portfolios: [...state.portfolios, item], activeId: item.id } };
}
export function renamePortfolio(state: PortfolioState, id: string, name: string): Result<PortfolioState> {
  const clean = cleanText(name, PORTFOLIO_LIMITS.nameCharacters);
  if (!clean) return { ok: false, error: 'Enter a portfolio name.' };
  if (!state.portfolios.some(item => item.id === id)) return { ok: false, error: 'That portfolio no longer exists.' };
  if (state.portfolios.some(item => item.id !== id && item.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: 'A portfolio with that name already exists.' };
  return { ok: true, value: { ...state, portfolios: state.portfolios.map(item => item.id === id ? { ...item, name: clean } : item) } };
}
export function deletePortfolio(state: PortfolioState, id: string): PortfolioState {
  const portfolios = state.portfolios.filter(item => item.id !== id);
  return { ...state, portfolios, activeId: state.activeId === id ? portfolios[0]?.id ?? null : state.activeId };
}
export function updatePortfolio(state: PortfolioState, id: string, patch: Partial<Pick<Portfolio, 'showSold' | 'benchmark' | 'range'>>): PortfolioState {
  return { ...state, portfolios: state.portfolios.map(item => item.id === id ? { ...item, ...patch } : item) };
}

function withTransactions(state: PortfolioState, id: string, build: (rows: PortfolioTx[]) => Result<PortfolioTx[]>): Result<PortfolioState> {
  const found = state.portfolios.find(item => item.id === id); if (!found) return { ok: false, error: 'That portfolio no longer exists.' };
  const built = build(found.transactions); if (!built.ok) return built;
  if (built.value.length > PORTFOLIO_LIMITS.transactions) return { ok: false, error: `A portfolio keeps at most ${PORTFOLIO_LIMITS.transactions} transactions.` };
  const sorted = sortTransactions(built.value), check = replay(sorted); if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, value: { ...state, portfolios: state.portfolios.map(item => item.id === id ? { ...item, transactions: sorted } : item) } };
}
export function addTransaction(state: PortfolioState, id: string, input: unknown): Result<PortfolioState> {
  const tx = normalizeTransaction(input); if (!tx.ok) return tx;
  return withTransactions(state, id, rows => ({ ok: true, value: [...rows, tx.value] }));
}
export function editTransaction(state: PortfolioState, id: string, txId: string, input: unknown): Result<PortfolioState> {
  const tx = normalizeTransaction({ ...(isObject(input) ? input : {}), id: txId }); if (!tx.ok) return tx;
  return withTransactions(state, id, rows => rows.some(row => row.id === txId) ? { ok: true, value: rows.map(row => row.id === txId ? { ...tx.value, source: row.source } : row) } : { ok: false, error: 'That transaction no longer exists.' });
}
export function deleteTransaction(state: PortfolioState, id: string, txId: string): Result<PortfolioState> {
  return withTransactions(state, id, rows => ({ ok: true, value: rows.filter(row => row.id !== txId) }));
}
/** Replaces the whole history (CSV replace mode). */
export function setTransactions(state: PortfolioState, id: string, rows: readonly PortfolioTx[]): Result<PortfolioState> { return withTransactions(state, id, () => ({ ok: true, value: [...rows] })); }
export function appendTransactions(state: PortfolioState, id: string, rows: readonly PortfolioTx[]): Result<PortfolioState> { return withTransactions(state, id, current => ({ ok: true, value: [...current, ...rows] })); }

// ---------------------------------------------------------------- prices

export interface PricePoint { price: number; time: number; currency: string; source: string; }
export type PriceBook = Record<string, PricePoint>;
/** Per symbol, the dataset whose last bar is newest (ties: more bars). */
export function pickSeries(datasets: readonly BarDataset[]): Record<string, BarDataset> {
  const out: Record<string, BarDataset> = {};
  for (const dataset of datasets) {
    if (!dataset.bars.length) continue;
    const key = dataset.instrument.symbol.toUpperCase(), old = out[key], last = dataset.bars[dataset.bars.length - 1].time;
    if (!old) { out[key] = dataset; continue; }
    const oldLast = old.bars[old.bars.length - 1].time;
    if (last > oldLast || (last === oldLast && dataset.bars.length > old.bars.length)) out[key] = dataset;
  }
  return out;
}
/** The latest loaded close per symbol, with its bar time and provenance. */
export function priceBookFromDatasets(datasets: readonly BarDataset[]): PriceBook {
  const book: PriceBook = {};
  for (const [symbol, dataset] of Object.entries(pickSeries(datasets))) {
    const bar = dataset.bars[dataset.bars.length - 1];
    book[symbol] = { price: bar.close, time: bar.time, currency: dataset.instrument.currency, source: dataset.provenance ? (dataset.provenance.fixture ? 'SYNTHETIC ' : '') + dataset.provenance.providerName : 'loaded data' };
  }
  return book;
}

export interface Holding {
  symbol: string; quantity: number; averageCost: number; cost: number; price: number | null; value: number | null; unrealized: number | null; unrealizedPercent: number | null;
  realized: number; weight: number | null; priceTime: number | null; priceSource: string | null; unavailable: string | null; sold: boolean;
}
export interface PortfolioSummary {
  cash: number; holdingsValue: number; totalValue: number;
  /** Positions without a usable price; their value is left out of the totals and never shown as zero. */
  unpriced: string[];
  cost: number; realized: number; unrealized: number;
  /** Realized + unrealized + dividends - stand-alone fees (trade fees are already inside realized and cost). */
  totalPnl: number;
  dividends: number; feesPaid: number; deposits: number; withdrawals: number; netContributions: number;
}
export function computeHoldings(portfolio: Portfolio, prices: PriceBook, until = Infinity): { holdings: Holding[]; summary: PortfolioSummary } | { error: string } {
  const run = replay(portfolio.transactions, until); if (!run.ok) return { error: run.error };
  const book = run.book, holdings: Holding[] = [];
  for (const [symbol, lot] of book.lots) {
    const quote = prices[symbol], sold = lot.quantity <= EPS;
    let price: number | null = null, unavailable: string | null = null;
    if (!sold) {
      if (!quote) unavailable = 'No price: no loaded data for this symbol';
      else if (quote.currency && portfolio.currency && quote.currency.toUpperCase() !== portfolio.currency.toUpperCase()) unavailable = `No price: data is in ${quote.currency}, portfolio is in ${portfolio.currency}`;
      else price = quote.price;
    }
    const value = price === null ? null : price * lot.quantity, unrealized = value === null ? null : value - lot.cost;
    holdings.push({ symbol, quantity: sold ? 0 : lot.quantity, averageCost: sold ? 0 : lot.cost / lot.quantity, cost: sold ? 0 : lot.cost, price, value, unrealized, unrealizedPercent: unrealized !== null && lot.cost > 0 ? unrealized / lot.cost * 100 : null, realized: lot.realized, weight: null, priceTime: price !== null ? quote.time : null, priceSource: price !== null ? quote.source : null, unavailable, sold });
  }
  const open = holdings.filter(row => !row.sold);
  const holdingsValue = open.reduce((sum, row) => sum + (row.value ?? 0), 0), totalValue = book.cash + holdingsValue;
  for (const row of open) row.weight = row.value !== null && totalValue > 0 ? row.value / totalValue * 100 : null;
  const unrealized = open.reduce((sum, row) => sum + (row.unrealized ?? 0), 0);
  holdings.sort((a, b) => Number(a.sold) - Number(b.sold) || (b.value ?? -1) - (a.value ?? -1) || a.symbol.localeCompare(b.symbol));
  return { holdings, summary: { cash: book.cash, holdingsValue, totalValue, unpriced: open.filter(row => row.value === null).map(row => row.symbol), cost: open.reduce((sum, row) => sum + row.cost, 0), realized: book.realized, unrealized, totalPnl: book.realized + unrealized + book.dividends - book.otherFees, dividends: book.dividends, feesPaid: book.feesPaid, deposits: book.deposits, withdrawals: book.withdrawals, netContributions: book.deposits - book.withdrawals } };
}
