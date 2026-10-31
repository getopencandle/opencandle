import { describe, expect, it } from 'vitest';
import { addTransaction, computeHoldings, createPortfolio, createPortfolioState, deleteTransaction, editTransaction, priceBookFromDatasets, renamePortfolio, deletePortfolio, restorePortfolioState, activePortfolio, type PortfolioState } from '../../src/portfolio/portfolio';
import { DAY, allocate, closeAt, computePerformance, dailySeries, metaFromDatasets, seriesBook, xirr } from '../../src/portfolio/portfolio-performance';
import { PORTFOLIO_CSV_TEMPLATE, paperAccountToTransactions, parsePortfolioCsv, parseCsvRows, portfolioToCsv } from '../../src/portfolio/portfolio-csv';
import type { BarDataset } from '../../src/domain/types';

import { D0, dataset, seeded } from './helpers';

describe('portfolio model: average cost', () => {
  const rows = [
    { type: 'deposit', time: D0, amount: 10000 },
    { type: 'buy', time: D0 + 10, symbol: 'aaa', quantity: 10, price: 100, fee: 1 },
    { type: 'buy', time: D0 + 20, symbol: 'AAA', quantity: 10, price: 120, fee: 1 },
    { type: 'sell', time: D0 + 30, symbol: 'AAA', quantity: 5, price: 130, fee: 1 },
  ];
  it('matches the hand-computed book', () => {
    // buys: cost 1001 + 1201 = 2202 for 20 sh, avg 110.1. sell 5 @130 fee 1: proceeds 649, cost removed 550.5, realized 98.5.
    // cash 10000 - 1001 - 1201 + 649 = 8447. 15 sh, cost 1651.5. At 140: value 2100, unrealized 448.5.
    const { state } = seeded(rows), p = activePortfolio(state)!;
    const out = computeHoldings(p, priceBookFromDatasets([dataset('AAA', [140])])) as any;
    const h = out.holdings[0], s = out.summary;
    expect(h.symbol).toBe('AAA'); expect(h.quantity).toBe(15); expect(h.cost).toBeCloseTo(1651.5, 9); expect(h.averageCost).toBeCloseTo(110.1, 9);
    expect(s.cash).toBeCloseTo(8447, 9); expect(s.realized).toBeCloseTo(98.5, 9); expect(s.unrealized).toBeCloseTo(448.5, 9);
    expect(s.holdingsValue).toBe(2100); expect(s.totalValue).toBeCloseTo(10547, 9);
    expect(s.totalPnl).toBeCloseTo(547, 9); // equals value minus net deposits
    expect(s.totalPnl).toBeCloseTo(s.totalValue - s.netContributions, 9);
    expect(s.feesPaid).toBe(3); expect(h.weight).toBeCloseTo(2100 / 10547 * 100, 9);
  });
  it('counts dividends and stand-alone fees in total PnL', () => {
    const { state } = seeded([...rows, { type: 'dividend', time: D0 + 40, symbol: 'AAA', amount: 7.5 }, { type: 'fee', time: D0 + 50, amount: 2 }, { type: 'withdrawal', time: D0 + 60, amount: 500 }]);
    const s = (computeHoldings(activePortfolio(state)!, priceBookFromDatasets([dataset('AAA', [140])])) as any).summary;
    expect(s.cash).toBeCloseTo(8447 + 7.5 - 2 - 500, 9);
    expect(s.totalPnl).toBeCloseTo(547 + 7.5 - 2, 9);
    expect(s.totalValue - s.netContributions).toBeCloseTo(s.totalPnl, 9);
  });
  it('refuses to sell more than is held, including by backdating or deleting a buy', () => {
    const { state, id } = seeded(rows);
    expect(addTransaction(state, id, { type: 'sell', time: D0 + 40, symbol: 'AAA', quantity: 16, price: 1 })).toMatchObject({ ok: false });
    expect(addTransaction(state, id, { type: 'sell', time: D0 + 5, symbol: 'AAA', quantity: 1, price: 1 })).toMatchObject({ ok: false });
    const small = seeded([{ type: 'buy', time: D0, symbol: 'AAA', quantity: 10, price: 1 }, { type: 'sell', time: D0 + 1, symbol: 'AAA', quantity: 8, price: 1 }]), buy = activePortfolio(small.state)!.transactions[0];
    expect(deleteTransaction(small.state, small.id, buy.id)).toMatchObject({ ok: false });
    expect(editTransaction(small.state, small.id, buy.id, { type: 'buy', time: D0, symbol: 'AAA', quantity: 7, price: 1 })).toMatchObject({ ok: false });
  });
  it('validates inputs', () => {
    const { state, id } = seeded([]);
    for (const bad of [{ type: 'buy', time: D0, symbol: '', quantity: 1, price: 1 }, { type: 'buy', time: D0, symbol: 'A', quantity: 0, price: 1 }, { type: 'buy', time: D0, symbol: 'A', quantity: 1, price: -1 }, { type: 'deposit', time: D0, amount: 0 }, { type: 'bogus', time: D0 }, { type: 'buy', time: NaN, symbol: 'A', quantity: 1, price: 1 }, { type: 'buy', time: D0, symbol: 'A', quantity: 1, price: 1, fee: -1 }])
      expect(addTransaction(state, id, bad)).toMatchObject({ ok: false });
  });
  it('edits and deletes transactions and keeps order by time', () => {
    const { state, id } = seeded([{ type: 'deposit', time: D0 + 50, amount: 5 }, { type: 'deposit', time: D0, amount: 1 }]);
    const p = activePortfolio(state)!; expect(p.transactions.map(t => t.amount)).toEqual([1, 5]);
    const edited = editTransaction(state, id, p.transactions[1].id, { type: 'deposit', time: D0 - 10, amount: 9 }); if (!edited.ok) throw Error(edited.error);
    expect(activePortfolio(edited.value)!.transactions.map(t => t.amount)).toEqual([9, 1]);
    const gone = deleteTransaction(edited.value, id, p.transactions[0].id); if (!gone.ok) throw Error(gone.error);
    expect(activePortfolio(gone.value)!.transactions).toHaveLength(1);
  });
  it('shows no price instead of zero, and refuses to convert a foreign currency', () => {
    const { state } = seeded(rows), p = activePortfolio(state)!;
    const none = computeHoldings(p, {}) as any;
    expect(none.holdings[0].price).toBeNull(); expect(none.holdings[0].value).toBeNull(); expect(none.holdings[0].unavailable).toMatch(/No price/);
    expect(none.summary.unpriced).toEqual(['AAA']); expect(none.summary.holdingsValue).toBe(0);
    const eur = computeHoldings(p, priceBookFromDatasets([dataset('AAA', [140], { currency: 'EUR' })])) as any;
    expect(eur.holdings[0].value).toBeNull(); expect(eur.holdings[0].unavailable).toMatch(/EUR/);
  });
  it('keeps sold positions with realized PnL', () => {
    const { state } = seeded([{ type: 'deposit', time: D0, amount: 1000 }, { type: 'buy', time: D0 + 1, symbol: 'ZZZ', quantity: 4, price: 10 }, { type: 'sell', time: D0 + 2, symbol: 'ZZZ', quantity: 4, price: 12 }]);
    const out = computeHoldings(activePortfolio(state)!, {}) as any;
    expect(out.holdings[0]).toMatchObject({ symbol: 'ZZZ', sold: true, quantity: 0, realized: 8 });
    expect(out.summary.unpriced).toEqual([]); expect(out.summary.cash).toBe(1008);
  });
});

describe('portfolio state', () => {
  it('creates, renames, deletes and rejects duplicates', () => {
    let s = createPortfolioState(); const a = createPortfolio(s, ' One '); if (!a.ok) throw Error(); s = a.value;
    expect(createPortfolio(s, 'one')).toMatchObject({ ok: false }); expect(createPortfolio(s, '  ')).toMatchObject({ ok: false });
    const b = createPortfolio(s, 'Two'); if (!b.ok) throw Error(); s = b.value;
    const r = renamePortfolio(s, s.activeId!, 'One'); expect(r).toMatchObject({ ok: false });
    const del = deletePortfolio(s, s.activeId!); expect(del.portfolios).toHaveLength(1); expect(del.activeId).toBe(del.portfolios[0].id);
  });
  it('restores defensively', () => {
    expect(restorePortfolioState(null).portfolios).toEqual([]);
    const { state } = seeded([{ type: 'deposit', time: D0, amount: 5 }]);
    const round = restorePortfolioState(JSON.parse(JSON.stringify(state))); expect(round).toEqual(state);
    const dirty = JSON.parse(JSON.stringify(state)); dirty.portfolios[0].transactions.push({ type: 'sell', time: D0 + 9, symbol: 'Q', quantity: 5, price: 1, source: 'manual', id: 'x' }, 7, { type: 'nope' });
    expect(restorePortfolioState(dirty).portfolios[0].transactions).toEqual([]); // an impossible history is dropped whole
    expect(restorePortfolioState({ portfolios: [{ id: 'a', name: 'x' }, { id: 'a', name: 'dup' }], activeId: 'zzz', tab: 'bad' })).toMatchObject({ activeId: 'a', tab: 'overview' });
  });
});

describe('performance', () => {
  // deposit 1000 d0, buy 10 @100 d0, deposit 1100 on d2. closes 100,110,110,121.
  // day returns: d0 0, d1 +10%, d2 2200/(1100+1100)-1 = 0, d3 2310/2200-1 = +5%. TWR = 1.1*1.05-1 = 15.5%.
  const rows = [{ type: 'deposit', time: D0, amount: 1000 }, { type: 'buy', time: D0 + 3600, symbol: 'AAA', quantity: 10, price: 100 }, { type: 'deposit', time: D0 + 2 * DAY + 3600, amount: 1100 }];
  const data = [dataset('AAA', [100, 110, 110, 121]), dataset('BMK', [50, 55, 55, 60.5], { assetClass: 'etf' })];
  const asOf = D0 + 3 * DAY;
  it('chains daily returns around cash flows (TWR)', () => {
    const { state } = seeded(rows), p = activePortfolio(state)!;
    const daily = dailySeries(p, seriesBook(p, data), asOf) as any;
    expect(daily.points.map((x: any) => x.value)).toEqual([1000, 1100, 2200, 2310]);
    expect(daily.points.map((x: any) => +x.returnPct.toFixed(10))).toEqual([0, 0.1, 0, 0.05]);
    const perf = (computePerformance(p, data, asOf, 'ALL', null) as any).value;
    expect(perf.twr).toBeCloseTo(0.155, 12); expect(perf.pnl).toBeCloseTo(210, 9); expect(perf.netFlows).toBe(2100); expect(perf.endValue).toBe(2310);
  });
  it('MWR is the internal rate of the dated flows', () => {
    const { state } = seeded(rows), perf = (computePerformance(activePortfolio(state)!, data, asOf, 'ALL', null) as any).value;
    const flows = [{ t: D0, a: -1000 }, { t: D0 + 2 * DAY + 3600, a: -1100 }, { t: D0 + 4 * DAY, a: 2310 }];
    const npv = flows.reduce((sum, f) => sum + f.a / Math.pow(1 + perf.mwr, (f.t - D0) / (365 * DAY)), 0);
    expect(Math.abs(npv)).toBeLessThan(1e-6); expect(perf.mwr).toBeGreaterThan(perf.twr); // annualized over four days
  });
  it('xirr hand checks', () => {
    expect(xirr([{ time: 0, amount: -1000 }, { time: 365 * DAY, amount: 1100 }])).toBeCloseTo(0.1, 9);
    expect(xirr([{ time: 0, amount: -1000 }, { time: 730 * DAY, amount: 1210 }])).toBeCloseTo(0.1, 9);
    expect(xirr([{ time: 0, amount: -1000 }, { time: 365 * DAY, amount: 500 }])).toBeCloseTo(-0.5, 9);
    expect(xirr([{ time: 0, amount: -1000 }])).toBeNull(); expect(xirr([{ time: 0, amount: 5 }, { time: DAY, amount: 6 }])).toBeNull();
  });
  it('compares against a loaded benchmark', () => {
    const { state } = seeded(rows), res = (computePerformance(activePortfolio(state)!, data, asOf, 'ALL', 'BMK') as any).value;
    expect(res.benchmarkReturn).toBeCloseTo(60.5 / 50 - 1, 12); // from the close of the first day (50) to the last close (60.5)
    expect(res.notes.join(' ')).toMatch(/first day/);
    expect(res.points[0]).toEqual({ time: D0, portfolio: 100, benchmark: 100 });
    const last = res.points[res.points.length - 1]; expect(last.portfolio).toBeCloseTo(115.5, 9); expect(last.benchmark).toBeCloseTo(121, 9);
    const missing = (computePerformance(activePortfolio(state)!, data, asOf, 'ALL', 'NOPE') as any).value;
    expect(missing.benchmarkReturn).toBeNull(); expect(missing.notes.join(' ')).toMatch(/not loaded/);
  });
  it('limits a range to its window', () => {
    const closes = Array.from({ length: 40 }, (_, i) => i < 20 ? 100 : 110), bm = Array.from({ length: 40 }, (_, i) => i < 20 ? 50 : 55);
    const long = [dataset('AAA', closes), dataset('BMK', bm)];
    const { state } = seeded([{ type: 'deposit', time: D0, amount: 1000 }, { type: 'buy', time: D0 + 60, symbol: 'AAA', quantity: 10, price: 100 }]);
    const res = (computePerformance(activePortfolio(state)!, long, D0 + 39 * DAY, '1M', 'BMK') as any).value;
    expect(res.startTime).toBe(D0 + 9 * DAY); expect(res.startValue).toBe(1000); expect(res.endValue).toBe(1100);
    expect(res.twr).toBeCloseTo(0.1, 12); expect(res.pnl).toBe(100); expect(res.benchmarkReturn).toBeCloseTo(0.1, 12);
    expect(res.points).toHaveLength(32);
  });
  it('values a holding with no bars yet at its last trade price, and handles empty portfolios', () => {
    const { state } = seeded([{ type: 'deposit', time: D0, amount: 1000 }, { type: 'buy', time: D0 + 60, symbol: 'AAA', quantity: 10, price: 100 }]);
    const daily = dailySeries(activePortfolio(state)!, {}, D0 + DAY) as any;
    expect(daily.points.map((x: any) => x.value)).toEqual([1000, 1000]);
    expect(computePerformance(activePortfolio(seeded([]).state)!, [], D0)).toMatchObject({ ok: false });
  });
  it('closeAt finds the last bar at or before a time', () => {
    const bars = dataset('A', [1, 2, 3]).bars;
    expect(closeAt(bars, D0 - 1)).toBeNull(); expect(closeAt(bars, D0)).toBe(1); expect(closeAt(bars, D0 + DAY + 5)).toBe(2); expect(closeAt(bars, D0 + 99 * DAY)).toBe(3);
  });
});

describe('allocation', () => {
  it('splits value by asset class with cash, and reports sector as unavailable until supplied', () => {
    const { state } = seeded([{ type: 'deposit', time: D0, amount: 1000 }, { type: 'buy', time: D0 + 1, symbol: 'AAA', quantity: 5, price: 100 }, { type: 'buy', time: D0 + 2, symbol: 'ETF', quantity: 2, price: 50 }, { type: 'buy', time: D0 + 3, symbol: 'ZZZ', quantity: 1, price: 10 }]);
    const data = [dataset('AAA', [100]), dataset('ETF', [50], { assetClass: 'etf' })], out = computeHoldings(activePortfolio(state)!, priceBookFromDatasets(data)) as any;
    const meta = metaFromDatasets(data), alloc = allocate(out.holdings, out.summary.cash, meta, 'assetClass') as any;
    // cash 1000-500-100-10 = 390; stock 500, etf 100; ZZZ has no price and is left out
    expect(alloc.rows.map((r: any) => [r.label, r.value])).toEqual([['stock', 500], ['Cash', 390], ['etf', 100]]);
    expect(alloc.rows[0].percent).toBeCloseTo(500 / 990 * 100, 9); expect(alloc.excluded).toEqual(['ZZZ']);
    expect(allocate(out.holdings, out.summary.cash, meta, 'sector')).toMatchObject({ ok: false });
    const withSector = allocate(out.holdings, out.summary.cash, metaFromDatasets(data, { AAA: { sector: 'Tech' } }), 'sector') as any;
    expect(withSector.rows.map((r: any) => r.label)).toEqual(['Tech', 'Cash', 'Unclassified']);
  });
});

describe('csv', () => {
  it('parses quotes, CRLF and a BOM', () => {
    expect(parseCsvRows('﻿a,"b,1","c ""q"""\r\nx,y,z\r\n')).toEqual([['a', 'b,1', 'c "q"'], ['x', 'y', 'z']]);
  });
  it('imports the template and round-trips through export', () => {
    const parsed = parsePortfolioCsv(PORTFOLIO_CSV_TEMPLATE) as any;
    expect(parsed.errors).toEqual([]); expect(parsed.rows.map((r: any) => r.type)).toEqual(['deposit', 'buy', 'dividend', 'sell']);
    expect(parsed.rows[1]).toMatchObject({ symbol: 'AAA', quantity: 10, price: 100, fee: 1 });
    const { state } = seeded([]);
    const csv = portfolioToCsv({ ...activePortfolio(state)!, transactions: parsed.rows });
    const again = parsePortfolioCsv(csv) as any; expect(again.errors).toEqual([]);
    expect(again.rows.map((r: any) => ({ ...r, id: 0 }))).toEqual(parsed.rows.map((r: any) => ({ ...r, id: 0 })));
  });
  it('reports bad rows by line and guards spreadsheet formulas', () => {
    const parsed = parsePortfolioCsv('date,type,symbol,quantity,price,amount,fee,note\n2026-01-05,buy,AAA,x,1,,,\n01/05/2026,deposit,,,,5,,\n2026-01-05,swap,,,,,,\n2026-01-06,deposit,,,,5,,"=HYPERLINK(1)"\n') as any;
    expect(parsed.errors.map((e: any) => e.line)).toEqual([2, 3, 4]); expect(parsed.rows).toHaveLength(1);
    const csv = portfolioToCsv({ transactions: parsed.rows } as any);
    expect(csv.split('\n')[1]).toContain("'=HYPERLINK(1)");
    expect((parsePortfolioCsv(csv) as any).rows[0].note).toBe('=HYPERLINK(1)');
    expect(parsePortfolioCsv('foo,bar\n1,2')).toMatchObject({ fatal: expect.stringMatching(/date/) });
    expect(parsePortfolioCsv('')).toMatchObject({ fatal: expect.any(String) });
  });
});

describe('paper import', () => {
  const inst = { id: 'I1', symbol: 'abc', name: 'ABC', exchange: 'X', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
  const account: any = { id: 'acc', createdAt: D0, settings: { initialBalance: 5000, currency: 'USD' }, positions: {}, orders: [{ id: 'o1', instrument: inst }],
    fills: [{ id: 'f2', orderId: 'o1', instrumentId: 'I1', side: 'sell', quantity: 3, price: 12, commission: 0.5, at: D0 + 200 }, { id: 'f1', orderId: 'o1', instrumentId: 'I1', side: 'buy', quantity: 5, price: 10, commission: 1, at: D0 + 100 },
      { id: 'f3', orderId: 'o1', instrumentId: 'I1', side: 'sell', quantity: 9, price: 12, commission: 0, at: D0 + 300 }, { id: 'f4', orderId: 'o9', instrumentId: 'GONE', side: 'buy', quantity: 1, price: 1, commission: 0, at: D0 + 400 }] };
  it('turns the opening balance and fills into transactions and skips impossible ones', () => {
    const out = paperAccountToTransactions(account);
    expect(out.rows.map(r => [r.type, r.symbol, r.quantity])).toEqual([['deposit', undefined, undefined], ['buy', 'ABC', 5], ['sell', 'ABC', 3]]);
    expect(out.rows.every(r => r.source === 'paper')).toBe(true); expect(out.warnings).toHaveLength(2);
    const { state, id } = seeded([]); expect(addTransaction(state, id, out.rows[0]).ok).toBe(true);
  });
});
