import { describe, expect, it, vi } from 'vitest';
import { createPaperAccount, closePaperPosition, processPaperQuote, reversePaperPosition, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { csvCell, exportPaperCsv, filterJournal, paperExportTable, paperPositionCloses, toCsv } from '../../src/domain/paper-export';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'T:E', symbol: 'E', name: 'Synthetic export test', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (bid: number, ask: number, sequence: number, at: number): Quote => ({ instrumentId: instrument.id, bid, ask, eventTime: at, receivedAt: at, availableAt: at, sequence, session: 'regular', fixture: true });
function history(): PaperAccount {
  let account = createPaperAccount({ now: 0 });
  const step = (result: { ok: boolean; account: PaperAccount }) => { expect(result.ok).toBe(true); account = result.account; };
  step(processPaperQuote(account, quote(9.99, 10.01, 1, 10), 10));
  step(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 10 }, 10));
  step(processPaperQuote(account, quote(11.99, 12.01, 2, 20), 20));
  step(closePaperPosition(account, instrument.id, 20, 4));
  step(closePaperPosition(account, instrument.id, 20));
  step(processPaperQuote(account, quote(11.99, 12.01, 3, 30), 30));
  step(submitPaperOrder(account, { instrument, side: 'sell', type: 'market', quantity: 5 }, 30));
  step(processPaperQuote(account, quote(8.99, 9.01, 4, 40), 40));
  step(reversePaperPosition(account, instrument.id, 40));
  return account;
}

describe('CSV escaping', () => {
  it.each([
    ['=1+1', "'=1+1"], ['+1', "'+1"], ['-1', "'-1"], ['@SUM(A1)', "'@SUM(A1)"], ['\tcmd', "'\tcmd"], ['\rcmd', "\"'\rcmd\""],
    ['plain', 'plain'], ['a,b', '"a,b"'], ['say "hi"', '"say ""hi"""'], ['two\nlines', '"two\nlines"'], ['', ''],
    ['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
  ])('cell %j is written as %j', (input, expected) => { expect(csvCell(input)).toBe(expected); });
  it('writes numbers as numbers and nothing as an empty cell', () => {
    expect(csvCell(-12.5)).toBe('-12.5'); expect(csvCell(0)).toBe('0'); expect(csvCell(null)).toBe(''); expect(csvCell(undefined)).toBe('');
  });
  it('joins rows with CRLF and escapes header cells too', () => {
    expect(toCsv(['A', '=B'], [[1, 'x,y'], ['-z', 2]])).toBe("A,'=B\r\n1,\"x,y\"\r\n'-z,2\r\n");
  });
});

describe('export tables', () => {
  it('uses the visible column titles and honors the Expiry column setting', () => {
    const account = submitPaperOrder(processPaperQuote(createPaperAccount({ now: 0 }), quote(9.99, 10.01, 1, 10), 10).account, { instrument, side: 'buy', type: 'limit', quantity: 3, limitPrice: 9, timeInForce: 'GTD', expiresAt: 100000 }, 10).account;
    const visible = paperExportTable(account, 'orders', {});
    expect(visible.columns).toEqual(['Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Instruction', 'Status', 'Expiry (UTC)']);
    expect(visible.rows).toHaveLength(1); expect(visible.rows[0][0]).toBe('E');
    const hidden = paperExportTable(account, 'orders', { ordersColumns: { expiry: false } });
    expect(hidden.columns).not.toContain('Expiry (UTC)'); expect(hidden.rows[0]).toHaveLength(6);
    expect(visible.fileName).toBe('OpenCandle-virtual-orders.csv');
  });
  it('exports positions, order history, and the journal', () => {
    const account = history();
    expect(paperExportTable(account, 'positions', {}).columns).toEqual(['Symbol', 'Side', 'Quantity', 'Average price', 'Mark', 'Unrealized P&L', 'Realized gross']);
    const orders = paperExportTable(account, 'history', {});
    expect(orders.columns[0]).toBe('Updated'); expect(orders.rows.length).toBeGreaterThan(0);
    const journal = paperExportTable(account, 'journal', {});
    expect(journal.columns).toEqual(['Time', 'Order', 'Event', 'Details']); expect(journal.rows.length).toBe(account.events.length);
  });
  it('journal search is a case-insensitive text match over the event text', () => {
    const account = history();
    const all = filterJournal(account.events, '');
    expect(all).toHaveLength(account.events.length);
    const filled = filterJournal(account.events, 'FILLED');
    expect(filled.length).toBeGreaterThan(0); expect(filled.every(event => /filled/i.test(event.type + ' ' + event.message))).toBe(true);
    expect(filterJournal(account.events, '  virtual fee ').length).toBeGreaterThan(0);
    expect(filterJournal(account.events, 'no such text')).toEqual([]);
    expect(paperExportTable(account, 'journal', { journalQuery: 'cancelled' }).rows.length).toBe(filterJournal(account.events, 'cancelled').length);
  });
  it('prefixes a formula-like symbol or reason in the written file', () => {
    const account = history(); account.orders[0].rejectionReason = '=cmd|calc';
    const table = paperExportTable(account, 'history', {});
    expect(toCsv(table.columns, table.rows)).toContain("'=cmd|calc");
  });
});

describe('ACCOUNT_HISTORY grouping by closed position', () => {
  // Hand-computed: buy 10 @ 10.01; sell 4 and 6 @ 11.99 closes the long (7.92 + 11.88 = 19.80); sell 5 @ 11.99 opens a short;
  // the reverse buys 10 @ 9.01, closing the short (5 * (11.99 - 9.01) = 14.90) and opening a long of 5 with the same fill.
  it('lists one group per closed position with the fills under it, oldest first', () => {
    const groups = paperPositionCloses(history());
    expect(groups.map(group => [group.direction, group.status, group.fills.length])).toEqual([['long', 'closed', 3], ['short', 'closed', 2], ['long', 'open', 1]]);
    expect(groups[0].realizedGross).toBeCloseTo(19.8, 8);
    expect(groups[1].realizedGross).toBeCloseTo(14.9, 8);
    expect(groups[2].realizedGross).toBe(0);
    expect(groups[0].fees).toBe(0); expect(groups[0].netRealized).toBeCloseTo(19.8, 8);
  });
  it('flattens groups into one export row per fill', () => {
    const table = paperExportTable(history(), 'account-history', {});
    expect(table.columns[0]).toBe('Position'); expect(table.rows.length).toBe(6);
    expect(table.fileName).toBe('OpenCandle-virtual-account-history.csv');
  });
});

describe('atomic export', () => {
  const table = { tab: 'orders', fileName: 'x.csv', columns: ['A'], rows: [[1]] } as const;
  it('writes through the data export bridge with the file name and CSV text', async () => {
    const exportData = vi.fn(async () => ({ ok: true as const }));
    expect(await exportPaperCsv(table as never, { exportData })).toEqual({ ok: true });
    expect(exportData).toHaveBeenCalledWith({ text: 'A\r\n1\r\n', format: 'csv', suggestedName: 'x.csv' });
  });
  it.each([
    ['a refusal', async () => ({ ok: false as const, error: { message: 'disk full' } })],
    ['a thrown error', async () => { throw new Error('boom'); }],
  ])('reports a failed write after %s and reports nothing else', async (_name, exportData) => {
    expect(await exportPaperCsv(table as never, { exportData: exportData as never })).toEqual({ ok: false, message: 'The file could not be saved.' });
  });
  it('reports the desktop-only limit when no bridge exists', async () => {
    expect(await exportPaperCsv(table as never, undefined)).toEqual({ ok: false, message: 'Saving a file needs the desktop app.' });
  });
});
