import React, { useMemo, useRef, useState } from 'react';
import type { BarDataset } from '../domain/types';
import type { PaperAccount } from '../domain/paper';
import { PORTFOLIO_COST_METHOD_LABEL, PORTFOLIO_NOTICE, PORTFOLIO_RANGES, PORTFOLIO_TABS, PORTFOLIO_TX_LABELS, PORTFOLIO_TX_TYPES, activePortfolio, addTransaction, appendTransactions, computeHoldings, createPortfolio, deletePortfolio, deleteTransaction, editTransaction, pickSeries, priceBookFromDatasets, renamePortfolio, restorePortfolioState, setTransactions, updatePortfolio, type Portfolio, type PortfolioRange, type PortfolioState, type PortfolioTab, type PortfolioTx, type PortfolioTxType, type Result } from '../portfolio/portfolio';
import { ALLOCATION_LABELS, allocate, computePerformance, metaFromDatasets, type AllocationBy, type InstrumentMeta, type PerformanceResult } from '../portfolio/portfolio-performance';
import { PORTFOLIO_CSV_COLUMNS, PORTFOLIO_CSV_TEMPLATE, PORTFOLIO_IMPORT_MODES, isoDate, parseDate, parsePortfolioCsv, paperAccountToTransactions, portfolioExportName, portfolioToCsv, type CsvPreview, type PortfolioImportMode } from '../portfolio/portfolio-csv';
import { Modal } from './Modal';
import { Select } from './Select';
import './portfolio.css';

const TAB_LABELS: Record<PortfolioTab, string> = { overview: 'Overview', holdings: 'Holdings', transactions: 'Transactions', analytics: 'Analytics' };
const NA = 'Unavailable';
export const fmtMoney = (value: number | null, currency: string) => value === null || !Number.isFinite(value) ? NA : value.toLocaleString('en-US', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD', maximumFractionDigits: 2 });
export const fmtNumber = (value: number | null, digits = 4) => value === null || !Number.isFinite(value) ? NA : value.toLocaleString('en-US', { maximumFractionDigits: digits });
export const fmtPercent = (value: number | null, digits = 2) => value === null || !Number.isFinite(value) ? NA : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
const tone = (value: number | null) => value === null ? '' : value > 0 ? 'pos' : value < 0 ? 'neg' : '';

export interface PortfolioDialogProps {
  state: PortfolioState; datasets: BarDataset[];
  /** Paper accounts (active first) offered for the one-way import. */
  paperAccounts?: readonly PaperAccount[];
  /** Optional sector and country per symbol (for example from heatmap metadata). */
  metadata?: Record<string, InstrumentMeta>;
  /** Clock override for tests. */
  asOf?: number;
  onChange: (state: PortfolioState) => boolean | void;
  onClose: () => void;
}
const todayIso = () => new Date().toISOString().slice(0, 10);
interface Form { type: PortfolioTxType; date: string; symbol: string; quantity: string; price: string; amount: string; fee: string; note: string; }
const blankForm = (): Form => ({ type: 'buy', date: todayIso(), symbol: '', quantity: '', price: '', amount: '', fee: '', note: '' });
const isTrade = (type: PortfolioTxType) => type === 'buy' || type === 'sell';
/** Builds the transaction input from the text fields. Returns an error message for an unreadable number or date. */
export function formToInput(form: Form): Result<Record<string, unknown>> {
  const time = parseDate(form.date); if (time === null) return { ok: false, error: 'Enter the date as 2026-01-31.' };
  const num = (text: string, label: string): number | undefined | string => { const clean = text.trim().replace(/,/g, ''); if (clean === '') return undefined; const value = Number(clean); return Number.isFinite(value) ? value : `${label} must be a number.`; };
  const quantity = num(form.quantity, 'Quantity'), price = num(form.price, 'Price'), amount = num(form.amount, 'Amount'), fee = num(form.fee, 'Fee');
  for (const part of [quantity, price, amount, fee]) if (typeof part === 'string') return { ok: false, error: part };
  return { ok: true, value: { type: form.type, time, symbol: form.symbol, quantity, price, amount, fee, note: form.note } };
}
const formFromTx = (tx: PortfolioTx): Form => ({ type: tx.type, date: isoDate(tx.time), symbol: tx.symbol ?? '', quantity: tx.quantity === undefined ? '' : String(tx.quantity), price: tx.price === undefined ? '' : String(tx.price), amount: tx.amount === undefined ? '' : String(tx.amount), fee: tx.fee === undefined ? '' : String(tx.fee), note: tx.note ?? '' });

function PerformanceChart({ perf }: { perf: PerformanceResult }) {
  const W = 640, H = 220, L = 44, R = 12, T = 12, B = 24, pts = perf.points;
  const values = pts.flatMap(p => [p.portfolio, ...(p.benchmark === null ? [] : [p.benchmark])]);
  const lo = Math.min(...values, 100), hi = Math.max(...values, 100), span = hi - lo || 1, t0 = pts[0].time, t1 = pts[pts.length - 1].time || t0 + 1;
  const x = (t: number) => L + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - L - R), y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);
  const path = (pick: (p: typeof pts[number]) => number | null) => pts.flatMap((p, i) => { const v = pick(p); return v === null ? [] : [`${i === 0 || pts[i - 1] && pick(pts[i - 1]) === null ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(v).toFixed(1)}`]; }).join(' ');
  return <svg className="pf-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Performance indexed to 100 from ${isoDate(t0)} to ${isoDate(t1)}`}>
    {[lo, (lo + hi) / 2, hi].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="pf-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="pf-axis">{v.toFixed(1)}</text></g>)}
    <line x1={L} x2={W - R} y1={y(100)} y2={y(100)} className="pf-base" />
    <text x={L} y={H - 6} className="pf-axis">{isoDate(t0)}</text><text x={W - R} y={H - 6} textAnchor="end" className="pf-axis">{isoDate(t1)}</text>
    {perf.benchmarkSymbol && <path d={path(p => p.benchmark)} className="pf-line bench" />}
    <path d={path(p => p.portfolio)} className="pf-line main" />
  </svg>;
}

export function PortfolioDialog({ state: initial, datasets, paperAccounts = [], metadata, asOf, onChange, onClose }: PortfolioDialogProps) {
  const [state, setState] = useState(() => restorePortfolioState(initial));
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [form, setForm] = useState<Form>(blankForm), [editing, setEditing] = useState<string | null>(null), [formOpen, setFormOpen] = useState(false);
  const [naming, setNaming] = useState<'create' | 'rename' | null>(null), [nameDraft, setNameDraft] = useState(''), [currencyDraft, setCurrencyDraft] = useState('USD'), [confirmDelete, setConfirmDelete] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false), [csvText, setCsvText] = useState(''), [csvMode, setCsvMode] = useState<PortfolioImportMode>('add'), [csvName, setCsvName] = useState('Imported portfolio'), [preview, setPreview] = useState<CsvPreview | null>(null);
  const [paperId, setPaperId] = useState(paperAccounts[0]?.id ?? ''), [allocBy, setAllocBy] = useState<AllocationBy>('assetClass');
  const fileRef = useRef<HTMLInputElement>(null);
  const portfolio = activePortfolio(state);

  function commit(result: Result<PortfolioState> | PortfolioState, message = ''): boolean {
    const next = 'ok' in result ? (result.ok ? result.value : null) : result;
    if (!next) { setError((result as { error: string }).error); return false; }
    if (onChange(next) === false) { setError('The workspace rejected this change. Nothing was saved.'); return false; }
    setState(next); setError(''); setStatus(message); return true;
  }
  const prices = useMemo(() => priceBookFromDatasets(datasets), [datasets]);
  const symbols = useMemo(() => Object.keys(pickSeries(datasets)).sort(), [datasets]);
  const held = useMemo(() => portfolio ? portfolio.transactions.flatMap(tx => tx.symbol ? [tx.symbol] : []) : [], [portfolio]);
  const computed = useMemo(() => portfolio ? computeHoldings(portfolio, prices) : null, [portfolio, prices]);
  const clock = useMemo(() => {
    if (asOf !== undefined) return asOf;
    const series = pickSeries(datasets), names = new Set([...held, ...(portfolio?.benchmark ? [portfolio.benchmark] : [])]);
    let latest = portfolio?.transactions.length ? portfolio.transactions[portfolio.transactions.length - 1].time : 0;
    for (const name of names) { const bars = series[name]?.bars; if (bars?.length) latest = Math.max(latest, bars[bars.length - 1].time); }
    return latest;
  }, [asOf, datasets, held, portfolio]);
  const perf = useMemo(() => portfolio && portfolio.transactions.length ? computePerformance(portfolio, datasets, clock) : null, [portfolio, datasets, clock]);
  const meta = useMemo(() => metaFromDatasets(datasets, metadata), [datasets, metadata]);
  const allocation = useMemo(() => computed && 'holdings' in computed && portfolio ? allocate(computed.holdings, computed.summary.cash, meta, allocBy) : null, [computed, meta, allocBy, portfolio]);
  const money = (value: number | null) => fmtMoney(value, portfolio?.currency ?? 'USD');

  function setTab(tab: PortfolioTab) { commit({ ...state, tab }); }
  function startNaming(mode: 'create' | 'rename') { setNaming(mode); setNameDraft(mode === 'rename' ? portfolio?.name ?? '' : ''); setCurrencyDraft(portfolio?.currency ?? 'USD'); setConfirmDelete(false); setError(''); }
  function submitName(event?: React.FormEvent) {
    event?.preventDefault();
    const result = naming === 'create' ? createPortfolio(state, nameDraft, currencyDraft) : portfolio ? renamePortfolio(state, portfolio.id, nameDraft) : { ok: false as const, error: 'No portfolio selected.' };
    if (commit(result, naming === 'create' ? 'Portfolio created.' : 'Portfolio renamed.')) setNaming(null);
  }
  function remove() { if (!portfolio) return; if (!confirmDelete) { setConfirmDelete(true); return; } setConfirmDelete(false); commit(deletePortfolio(state, portfolio.id), 'Portfolio deleted.'); }
  function submitTx(event: React.FormEvent) {
    event.preventDefault(); if (!portfolio) return;
    const input = formToInput(form); if (!input.ok) { setError(input.error); return; }
    const result = editing ? editTransaction(state, portfolio.id, editing, input.value) : addTransaction(state, portfolio.id, input.value);
    if (commit(result, editing ? 'Transaction updated.' : 'Transaction added.')) { setEditing(null); setForm({ ...blankForm(), date: form.date }); }
  }
  function startEdit(tx: PortfolioTx) { setEditing(tx.id); setForm(formFromTx(tx)); setFormOpen(true); setError(''); }
  function parseImport(text: string) { const parsed = parsePortfolioCsv(text); if ('fatal' in parsed) { setPreview(null); setError(parsed.fatal); } else { setPreview(parsed); setError(''); setStatus(`${parsed.rows.length} of ${parsed.lines} rows are ready. Nothing has been imported yet.`); } }
  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError('The file is larger than 4 MiB.'); return; }
    file.text().then(text => { setCsvText(text); setCsvName(file.name.replace(/\.[^.]+$/, '') || 'Imported portfolio'); parseImport(text); }, () => setError('The file could not be read.'));
  }
  function applyImport() {
    if (!preview?.rows.length) { setError('There are no valid rows to import.'); return; }
    let base = state, id = portfolio?.id ?? '';
    if (csvMode === 'create') { const made = createPortfolio(state, csvName); if (!made.ok) { setError(made.error); return; } base = made.value; id = made.value.activeId!; }
    else if (!portfolio) { setError('Choose a portfolio first, or import into a new one.'); return; }
    const result = csvMode === 'replace' ? setTransactions(base, id, preview.rows) : appendTransactions(base, id, preview.rows);
    if (commit(result, `Imported ${preview.rows.length} transactions.`)) { setPreview(null); setCsvText(''); setCsvOpen(false); }
  }
  function importPaper() {
    const account = paperAccounts.find(row => row.id === paperId); if (!account) { setError('Choose a virtual account.'); return; }
    const converted = paperAccountToTransactions(account);
    let name = `Virtual: ${account.name}`.slice(0, 64), n = 2; while (state.portfolios.some(row => row.name.toLowerCase() === name.toLowerCase())) name = `Virtual: ${account.name}`.slice(0, 58) + ' ' + n++;
    const made = createPortfolio(state, name, converted.currency); if (!made.ok) { setError(made.error); return; }
    const result = setTransactions(made.value, made.value.activeId!, converted.rows);
    commit(result, `Imported ${converted.rows.length} entries from the virtual account.${converted.warnings.length ? ' ' + converted.warnings.length + ' skipped.' : ''}`);
  }
  async function exportCsv() {
    if (!portfolio) return;
    if (typeof window === 'undefined' || !window.lv) { setError('Saving a file needs the desktop app.'); return; }
    try { const response = await window.lv.exportData({ text: portfolioToCsv(portfolio), suggestedName: portfolioExportName(portfolio), format: 'csv' }); if (!response.ok) { if (response.error.code !== 'CANCELLED') setError(response.error.message); } else { setStatus('Export saved locally.'); setError(''); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const holdingsError = computed && 'error' in computed ? computed.error : '';
  const summary = computed && 'summary' in computed ? computed.summary : null, holdings = computed && 'holdings' in computed ? computed.holdings : [];
  const shown = holdings.filter(row => portfolio?.showSold || !row.sold);
  const stat = (label: string, value: string, className = '') => <div className="pf-stat" key={label}><span>{label}</span><strong className={className}>{value}</strong></div>;

  const header = <div className="pf-top">
    {state.portfolios.length > 0 && <Select aria-label="Portfolio" value={state.activeId ?? ''} onChange={id => { setConfirmDelete(false); commit({ ...state, activeId: id }); }} options={state.portfolios.map(row => ({ value: row.id, label: row.name }))} />}
    {/* With no portfolio the empty state's Create portfolio is the one call to action. */}
    {state.portfolios.length > 0 && <button type="button" onClick={() => startNaming('create')}>New</button>}
    {portfolio && <><button type="button" onClick={() => startNaming('rename')}>Rename</button>
      <button type="button" className={confirmDelete ? 'pf-danger' : ''} data-lv-destructive="true" onClick={remove}>{confirmDelete ? 'Confirm delete' : 'Delete'}</button>
      {confirmDelete && <button type="button" onClick={() => setConfirmDelete(false)}>Keep</button>}
      <span className="pf-spacer" /><button type="button" onClick={exportCsv} disabled={!portfolio.transactions.length}>Export CSV</button></>}
    <button type="button" onClick={() => setCsvOpen(open => !open)} aria-expanded={csvOpen}>Import CSV</button>
  </div>;

  const nameForm = naming && <form className="pf-inline" onSubmit={submitName}>
    <label>{naming === 'create' ? 'New portfolio name' : 'Portfolio name'}<input aria-label="Portfolio name" autoFocus value={nameDraft} maxLength={64} onChange={event => setNameDraft(event.target.value)} /></label>
    {naming === 'create' && <label>Currency<input aria-label="Currency" value={currencyDraft} maxLength={8} onChange={event => setCurrencyDraft(event.target.value.toUpperCase())} className="pf-short" /></label>}
    <button type="submit">{naming === 'create' ? 'Create' : 'Save name'}</button><button type="button" onClick={() => setNaming(null)}>Cancel</button>
  </form>;

  const csvPanel = csvOpen && <section className="pf-panel" aria-label="Import CSV">
    <h3>Import transactions from CSV</h3>
    <p className="pf-hint">Columns: {PORTFOLIO_CSV_COLUMNS.join(', ')}. Dates look like 2026-01-31. Quantity, price and fee apply to buy and sell rows; amount applies to deposit, withdrawal, dividend and fee rows.</p>
    <div className="pf-inline">
      <Select aria-label="Import mode" value={csvMode} onChange={value => { setCsvMode(value as PortfolioImportMode); setPreview(null); }} options={(Object.keys(PORTFOLIO_IMPORT_MODES) as PortfolioImportMode[]).map(key => ({ value: key, label: PORTFOLIO_IMPORT_MODES[key], disabled: key !== 'create' && !portfolio }))} />
      {csvMode === 'create' && <input aria-label="New portfolio name for import" value={csvName} maxLength={64} onChange={event => setCsvName(event.target.value)} />}
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={chooseFile} />
      <button type="button" onClick={() => fileRef.current?.click()}>Choose file</button>
      <button type="button" onClick={() => { setCsvText(PORTFOLIO_CSV_TEMPLATE); setPreview(null); }}>Insert example</button>
    </div>
    <textarea aria-label="CSV text" rows={5} value={csvText} spellCheck={false} placeholder="Paste CSV text here" onChange={event => { setCsvText(event.target.value); setPreview(null); }} />
    <div className="pf-inline"><button type="button" onClick={() => parseImport(csvText)} disabled={!csvText.trim()}>Preview</button>
      <button type="button" className="pf-primary" onClick={applyImport} disabled={!preview?.rows.length}>{csvMode === 'replace' ? 'Replace history' : csvMode === 'create' ? 'Create and import' : 'Add rows'}</button></div>
    {preview && <div className="pf-preview" aria-label="Import preview"><p><strong>{preview.rows.length}</strong> valid rows{preview.errors.length ? <>, <strong className="neg">{preview.errors.length}</strong> rejected</> : ''}.{csvMode === 'replace' && portfolio ? ` The ${portfolio.transactions.length} existing transactions will be replaced.` : ''}</p>
      {preview.errors.slice(0, 8).map(item => <p className="neg" key={item.line}>Line {item.line}: {item.message}</p>)}
      {preview.rows.length > 0 && <table className="pf-table"><thead><tr><th>Date</th><th>Type</th><th>Symbol</th><th>Qty</th><th>Price</th><th>Amount</th><th>Fee</th></tr></thead><tbody>{preview.rows.slice(0, 6).map(row => <tr key={row.id}><td>{isoDate(row.time)}</td><td>{PORTFOLIO_TX_LABELS[row.type]}</td><td>{row.symbol ?? ''}</td><td>{row.quantity ?? ''}</td><td>{row.price ?? ''}</td><td>{row.amount ?? ''}</td><td>{row.fee ?? ''}</td></tr>)}</tbody></table>}</div>}
  </section>;

  const body = !portfolio ? <div className="pf-empty">
    <h3>No portfolio yet</h3>
    <p>Create a portfolio and enter your own buys, sells, cash, dividends and fees, or pull in a virtual paper account in one click.</p>
    <div className="pf-inline"><button type="button" className="pf-primary" onClick={() => startNaming('create')}>Create portfolio</button>
      {paperAccounts.length > 0 && <><Select aria-label="Virtual account" value={paperId} onChange={setPaperId} options={paperAccounts.map(row => ({ value: row.id, label: row.name }))} /><button type="button" onClick={importPaper}>Import virtual account</button></>}</div>
  </div> : <>
    <div className="pf-tabs" role="tablist" aria-label="Portfolio sections">{PORTFOLIO_TABS.map(tab => <button type="button" role="tab" id={'pf-tab-' + tab} key={tab} aria-selected={state.tab === tab} aria-controls="pf-panel" tabIndex={state.tab === tab ? 0 : -1} onClick={() => setTab(tab)} onKeyDown={event => { const i = PORTFOLIO_TABS.indexOf(tab), next = event.key === 'ArrowRight' ? (i + 1) % 4 : event.key === 'ArrowLeft' ? (i + 3) % 4 : -1; if (next >= 0) { event.preventDefault(); setTab(PORTFOLIO_TABS[next]); document.getElementById('pf-tab-' + PORTFOLIO_TABS[next])?.focus(); } }}>{TAB_LABELS[tab]}</button>)}</div>
    <div className="pf-body" id="pf-panel" role="tabpanel" aria-labelledby={'pf-tab-' + state.tab}>
      {holdingsError && <p className="pf-error" role="alert">{holdingsError}</p>}
      {state.tab === 'overview' && summary && <>
        <div className="pf-stats">
          {stat('Total value', money(summary.totalValue))}{stat('Cash', money(summary.cash), tone(summary.cash))}{stat('Holdings value', money(summary.holdingsValue))}
          {stat('Realized PnL', money(summary.realized), tone(summary.realized))}{stat('Unrealized PnL', money(summary.unrealized), tone(summary.unrealized))}{stat('Total PnL', money(summary.totalPnl), tone(summary.totalPnl))}
          {stat('Dividends', money(summary.dividends))}{stat('Fees paid', money(summary.feesPaid))}{stat('Net deposits', money(summary.netContributions))}
        </div>
        {summary.unpriced.length > 0 && <p className="pf-warn" role="status">No loaded price for {summary.unpriced.join(', ')}. Those positions are left out of the totals above and are never counted as zero.</p>}
        {!portfolio.transactions.length && <p className="pf-hint">This portfolio has no transactions yet. Open the Transactions tab to add one.</p>}
        <p className="pf-hint">Values use the latest loaded close for each symbol. {PORTFOLIO_COST_METHOD_LABEL}</p>
      </>}
      {state.tab === 'holdings' && <>
        <label className="pf-check"><input type="checkbox" checked={portfolio.showSold} onChange={event => commit(updatePortfolio(state, portfolio.id, { showSold: event.target.checked }))} /> Show sold positions</label>
        {shown.length ? <div className="pf-scroll"><table className="pf-table"><thead><tr><th>Symbol</th><th>Quantity</th><th>Avg cost</th><th>Price</th><th>Value</th><th>Unrealized</th><th>Unrealized %</th><th>Realized</th><th>Weight</th></tr></thead><tbody>
          {shown.map(row => <tr key={row.symbol} className={row.sold ? 'sold' : ''}><th scope="row">{row.symbol}{row.sold && <span className="pf-tag">sold</span>}</th><td>{row.sold ? '0' : fmtNumber(row.quantity)}</td><td>{row.sold ? '-' : money(row.averageCost)}</td>
            {row.unavailable ? <td colSpan={4} className="pf-na" title={row.unavailable}>{row.unavailable}</td> : row.sold ? <td colSpan={4} className="pf-na">Closed</td> : <><td title={row.priceTime ? `Bar ${isoDate(row.priceTime)}, ${row.priceSource}` : ''}>{money(row.price)}</td><td>{money(row.value)}</td><td className={tone(row.unrealized)}>{money(row.unrealized)}</td><td className={tone(row.unrealized)}>{fmtPercent(row.unrealizedPercent)}</td></>}
            <td className={tone(row.realized)}>{money(row.realized)}</td><td>{row.weight === null ? '-' : fmtPercent(row.weight, 1).replace('+', '')}</td></tr>)}
        </tbody></table></div> : <p className="pf-hint">No {portfolio.showSold ? '' : 'open '}positions yet.</p>}
        <p className="pf-hint">{PORTFOLIO_COST_METHOD_LABEL}</p>
      </>}
      {state.tab === 'transactions' && <>
        <div className="pf-inline"><button type="button" className="pf-primary" onClick={() => { setFormOpen(open => !open || editing !== null); setEditing(null); setForm(blankForm()); }}>{formOpen && !editing ? 'Close form' : 'Add transaction'}</button>
          {paperAccounts.length > 0 && <><span className="pf-spacer" /><Select aria-label="Virtual account" value={paperId} onChange={setPaperId} options={paperAccounts.map(row => ({ value: row.id, label: row.name }))} /><button type="button" onClick={importPaper}>Import virtual account</button></>}</div>
        {formOpen && <form className="pf-form" onSubmit={submitTx} aria-label={editing ? 'Edit transaction' : 'Add transaction'}>
          <label>Type<Select aria-label="Transaction type" value={form.type} onChange={value => setForm({ ...form, type: value as PortfolioTxType })} options={PORTFOLIO_TX_TYPES.map(type => ({ value: type, label: PORTFOLIO_TX_LABELS[type] }))} /></label>
          <label>Date<input aria-label="Date" value={form.date} placeholder="2026-01-31" onChange={event => setForm({ ...form, date: event.target.value })} /></label>
          {(isTrade(form.type) || form.type === 'dividend') && <label>Symbol<input aria-label="Symbol" list="pf-symbols" value={form.symbol} onChange={event => setForm({ ...form, symbol: event.target.value })} /></label>}
          {isTrade(form.type) ? <><label>Quantity<input aria-label="Quantity" inputMode="decimal" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></label>
            <label>Price<input aria-label="Price" inputMode="decimal" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /></label>
            <label>Fee<input aria-label="Fee" inputMode="decimal" value={form.fee} placeholder="0" onChange={event => setForm({ ...form, fee: event.target.value })} /></label></>
            : <label>Amount<input aria-label="Amount" inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label>}
          <label className="pf-wide">Note<input aria-label="Note" value={form.note} maxLength={200} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
          <datalist id="pf-symbols">{symbols.map(name => <option key={name} value={name} />)}</datalist>
          <div className="pf-inline"><button type="submit" className="pf-primary">{editing ? 'Save changes' : 'Add'}</button><button type="button" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancel</button></div>
        </form>}
        {portfolio.transactions.length ? <div className="pf-scroll"><table className="pf-table"><thead><tr><th>Date</th><th>Type</th><th>Symbol</th><th>Quantity</th><th>Price</th><th>Amount</th><th>Fee</th><th>Note</th><th><span className="pf-sr">Actions</span></th></tr></thead><tbody>
          {[...portfolio.transactions].reverse().map(tx => <tr key={tx.id}><td>{isoDate(tx.time)}</td><td>{PORTFOLIO_TX_LABELS[tx.type]}{tx.source === 'paper' && <span className="pf-tag">virtual</span>}</td><td>{tx.symbol ?? ''}</td><td>{tx.quantity === undefined ? '' : fmtNumber(tx.quantity)}</td><td>{tx.price === undefined ? '' : money(tx.price)}</td><td>{tx.amount === undefined ? '' : money(tx.amount)}</td><td>{tx.fee ? money(tx.fee) : ''}</td><td className="pf-note">{tx.note ?? ''}</td>
            <td className="pf-actions"><button type="button" aria-label={`Edit ${PORTFOLIO_TX_LABELS[tx.type]} ${isoDate(tx.time)}`} onClick={() => startEdit(tx)}>Edit</button><button type="button" aria-label={`Delete ${PORTFOLIO_TX_LABELS[tx.type]} ${isoDate(tx.time)}`} data-lv-destructive="true" onClick={() => commit(deleteTransaction(state, portfolio.id, tx.id), 'Transaction deleted.')}>Delete</button></td></tr>)}
        </tbody></table></div> : <p className="pf-hint">No transactions yet.</p>}
      </>}
      {state.tab === 'analytics' && <>
        <div className="pf-inline"><label>Range<Select aria-label="Range" value={portfolio.range} onChange={value => commit(updatePortfolio(state, portfolio.id, { range: value as PortfolioRange }))} options={PORTFOLIO_RANGES.map(range => ({ value: range, label: range === 'ALL' ? 'All' : range }))} /></label>
          <label>Benchmark<Select aria-label="Benchmark" value={portfolio.benchmark ?? ''} onChange={value => commit(updatePortfolio(state, portfolio.id, { benchmark: value || null }))} options={[{ value: '', label: 'None' }, ...symbols.map(name => ({ value: name, label: name }))]} /></label></div>
        {perf && !perf.ok && <p className="pf-hint">{perf.error}</p>}
        {!perf && <p className="pf-hint">Add transactions to see performance.</p>}
        {perf?.ok && <>
          <div className="pf-stats">
            {stat('Time-weighted return', perf.value.twr === null ? NA : fmtPercent(perf.value.twr * 100), tone(perf.value.twr))}
            {stat('Money-weighted return (annualized)', perf.value.mwr === null ? NA : fmtPercent(perf.value.mwr * 100), tone(perf.value.mwr))}
            {stat('PnL in range', money(perf.value.pnl), tone(perf.value.pnl))}
            {stat(perf.value.benchmarkSymbol ? `Benchmark ${perf.value.benchmarkSymbol}` : 'Benchmark', perf.value.benchmarkReturn === null ? NA : fmtPercent(perf.value.benchmarkReturn * 100), tone(perf.value.benchmarkReturn))}
            {stat('Start value', money(perf.value.startValue))}{stat('End value', money(perf.value.endValue))}
          </div>
          <PerformanceChart perf={perf.value} />
          <p className="pf-legend"><span className="pf-swatch main" /> Portfolio (TWR, indexed to 100){perf.value.benchmarkSymbol && perf.value.benchmarkReturn !== null && <><span className="pf-swatch bench" /> {perf.value.benchmarkSymbol}</>} <span className="pf-hint">{isoDate(perf.value.startTime)} to {isoDate(perf.value.endTime)}</span></p>
          {perf.value.notes.map(note => <p className="pf-warn" key={note} role="status">{note}</p>)}
          <p className="pf-hint">Time-weighted return chains daily returns and ignores the timing of deposits and withdrawals. Money-weighted return is the annualized internal rate of return of your dated deposits and withdrawals, so it is large or small for short ranges. Positions without bars before a date are valued at their last trade price. Foreign-currency data is never converted.</p>
        </>}
        <h3 className="pf-sub">Allocation <label className="pf-inline-label"><Select aria-label="Allocate by" value={allocBy} onChange={value => setAllocBy(value as AllocationBy)} options={(Object.keys(ALLOCATION_LABELS) as AllocationBy[]).map(key => ({ value: key, label: ALLOCATION_LABELS[key] }))} /></label></h3>
        {allocation?.ok === false && <p className="pf-hint">{allocation.reason}</p>}
        {allocation?.ok && (allocation.rows.length ? <div className="pf-alloc" aria-label="Allocation">{allocation.rows.map(row => <div className="pf-alloc-row" key={row.label}><span>{row.label}</span><span className="pf-bar"><i style={{ width: Math.max(1, Math.min(100, row.percent)) + '%' }} /></span><span>{row.percent.toFixed(1)}%</span><span>{money(row.value)}</span></div>)}{allocation.excluded.length > 0 && <p className="pf-warn">Left out (no price): {allocation.excluded.join(', ')}</p>}</div> : <p className="pf-hint">Nothing to allocate yet.</p>)}
      </>}
    </div>
  </>;

  return <Modal title="Portfolio" onClose={onClose} wide>
    <div className="pf-dialog">
      <p className="pf-notice">{PORTFOLIO_NOTICE}</p>
      {header}{nameForm}{csvPanel}
      {error && <p className="pf-error" role="alert">{error}</p>}
      {body}
      <footer className="pf-foot"><span role="status">{status}</span><button type="button" onClick={onClose}>Close</button></footer>
    </div>
  </Modal>;
}
export type { Portfolio };
