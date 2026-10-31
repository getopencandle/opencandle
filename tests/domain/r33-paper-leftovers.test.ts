import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configurePaperAccount, createPaperAccount, processPaperQuote, resetPaperAccount, restorePaperAccount, submitPaperOrder, validatePaperAccount, type PaperAccount } from '../../src/domain/paper';
import { nextPaperExpiry, sweepPaperExpiry } from '../../src/domain/paper-expiry-sweep';
import { brokerTicketInput, blankBrokerDraft, BROKER_DURATIONS } from '../../src/domain/paper-broker-ticket';
import { filterPaperJournal, paperJournalCounts, paperJournalExportTable, paperJournalRows } from '../../src/domain/paper-journal';
import { toCsv } from '../../src/domain/paper-export';
import type { Instrument, Quote } from '../../src/domain/types';

// Synthetic instruments and quotes, virtual money only.

describe('expiry sweep on the chart data time (Day and GTD, instruments no chart quotes)', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const other: Instrument = { id: 'SYNTHETIC:UNCHARTED', symbol: 'UNCH', name: 'Synthetic uncharted', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
  const quote: Quote = { instrumentId: other.id, bid: 9.99, ask: 10, session: 'regular', fixture: true, eventTime: 1000, receivedAt: 1000, availableAt: 1000, sequence: 1 };
  function placed(): PaperAccount {
    let account = processPaperQuote(createPaperAccount({ now: 0 }), quote, 1000).account;
    account = submitPaperOrder(account, { instrument: other, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce: 'DAY', expiresAt: 5000 }, 1000).account;
    account = submitPaperOrder(account, { instrument: other, side: 'buy', type: 'limit', quantity: 1, limitPrice: 8, timeInForce: 'GTD', expiresAt: 9000 }, 1000).account;
    return restorePaperAccount(JSON.parse(JSON.stringify(account))); // a relaunch
  }
  it('does nothing before the earliest expiry, and ignores the wall clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4e12);
    const account = placed();
    expect(nextPaperExpiry(account)).toBe(5000);
    expect(sweepPaperExpiry(account, 4999)).toBeNull();
    expect(sweepPaperExpiry(account, Number.NaN)).toBeNull();
  });
  it('expires a due Day order with no quote for its instrument, then the GTD order later', () => {
    const first = sweepPaperExpiry(placed(), 5000)!;
    expect(first.orders.map(order => order.status)).toEqual(['expired', 'working']);
    expect(first.clock).toBe(5000); expect(nextPaperExpiry(first)).toBe(9000);
    const second = sweepPaperExpiry(first, 9500)!;
    expect(second.orders.map(order => order.status)).toEqual(['expired', 'expired']);
    expect(nextPaperExpiry(second)).toBeNull(); expect(sweepPaperExpiry(second, 20000)).toBeNull();
  });
  it('App runs the sweep on the chart data time through the account authority (ROOT wiring)', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain("import {sweepPaperExpiry} from '../domain/paper-expiry-sweep';");
    // Expiry is scoped to the active chart's instrument and asset class, so opening FRED no longer expires GME Day orders.
    expect(app).toContain('const next=sweepPaperExpiry(account,virtualNow,{instrumentId:dataset.instrument.id,assetClass:dataset.instrument.assetClass});if(next)acceptPaper(next,account);},[virtualNow,paper,loaded,replay,dataset.instrument.id,dataset.instrument.assetClass]);');
    const sweep = app.slice(app.indexOf('Due Day/GTD orders expire once the chart data time passes them'), app.indexOf('[virtualNow,paper,loaded,replay,dataset.instrument.id,dataset.instrument.assetClass]'));// The effect deps gained the active instrument
    expect(sweep).not.toMatch(/Date\.now|performance\.now/);
  });
});

describe('order ticket Duration (Week and Month released)', () => {
  it('offers Day, GTC, GTD, Week and Month, and a Week draft carries the week validity', () => {
    expect(BROKER_DURATIONS.map(row => [row.id, row.unavailable ?? null])).toEqual([['day', null], ['gtc', null], ['gtd', null], ['week', null], ['month', null]]);
    expect(brokerTicketInput({ ...blankBrokerDraft('buy'), duration: 'week' }, 'USD').validity).toEqual({ kind: 'week' });
  });
});

describe('Account journal (PAPER.MANAGER.JOURNAL, OpenCandle-defined wording)', () => {
  const instrument: Instrument = { id: 'SYNTHETIC:JOURNAL', symbol: 'JRNL', name: 'Synthetic journal', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
  const q = (sequence: number, time: number): Quote => ({ instrumentId: instrument.id, bid: 50, ask: 50.02, session: 'regular', fixture: true, eventTime: time, receivedAt: time, availableAt: time, sequence });
  function traded(): PaperAccount {
    let account = processPaperQuote(createPaperAccount({ now: 0 }), q(1, 100), 100).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 2 }, 100).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 40 }, 110).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1000000, limitPrice: 40 }, 120).account;
    return account;
  }
  it('lists the account opening and every order event oldest first, newest first when filtered', () => {
    const rows = paperJournalRows(traded());
    expect(rows.map(row => row.event)).toEqual(['Account opened', 'Order placed', 'Order filled', 'Order placed', 'Order placed', 'Order rejected']);
    expect(rows[2]).toMatchObject({ symbol: 'JRNL', at: 100 });
    expect(filterPaperJournal(rows, 'all').map(row => row.at)).toEqual([120, 120, 110, 100, 100, 0]);
    expect(filterPaperJournal(rows, 'placed')).toHaveLength(3);
    expect(filterPaperJournal(rows, 'filled', 'jrnl')).toHaveLength(1);
    expect(filterPaperJournal(rows, 'all', 'buying power')).toEqual([expect.objectContaining({ event: 'Order rejected' })]);
    expect(paperJournalCounts(rows)).toMatchObject({ all: 6, placed: 3, filled: 1, rejected: 1, account: 1, cancelled: 0 });
  });
  it('records settings changes and resets; reset entries survive the reset and restore', () => {
    const configured = configurePaperAccount(traded(), { commission: { kind: 'per-unit', value: 0.01 }, leverage: 2 }, 130);
    expect(configured.ok).toBe(true);
    expect(configured.account.journal).toEqual([{ id: 1, at: 130, type: 'settings', message: 'Settings changed: commission 0.01 per unit; leverage 2x. Existing fills are unchanged.' }]);
    expect(configurePaperAccount(configured.account, { leverage: 2 }, 131).account.journal).toHaveLength(1);
    const reset = resetPaperAccount(configured.account, { initialBalance: 5000 }, 140);
    expect(reset.events).toEqual([]);
    expect(reset.journal?.map(row => [row.id, row.type, row.balance])).toEqual([[1, 'settings', undefined], [2, 'reset', 5000]]);
    expect(reset.journal?.[1].message).toBe('Virtual account reset. Starting balance 5000 USD; 3 orders and 1 fill from the previous history were cleared.');
    const rows = paperJournalRows(restorePaperAccount(JSON.parse(JSON.stringify(reset))));
    expect(rows.map(row => row.event)).toEqual(['Settings changed', 'Account reset']);
  });
  it('restore refuses a corrupt journal and accepts an account without one', () => {
    const reset = resetPaperAccount(traded(), {}, 140);
    expect(validatePaperAccount({ ...reset, journal: [{ ...reset.journal![0], type: 'deposit' }] }).ok).toBe(false);
    expect(validatePaperAccount({ ...reset, journal: [{ ...reset.journal![0], extra: 1 }] }).ok).toBe(false);
    expect(validatePaperAccount({ ...reset, journal: [reset.journal![0], reset.journal![0]] }).ok).toBe(false);
    const { journal: _journal, ...legacy } = reset;
    expect(validatePaperAccount(legacy).ok).toBe(true);
  });
  it('exports the filtered journal as CSV with spreadsheet-safe text', () => {
    const table = paperJournalExportTable(traded(), 'rejected');
    expect(table).toMatchObject({ kind: 'journal', fileName: 'OpenCandle-virtual-journal.csv', columns: ['Time (UTC)', 'Event', 'Symbol', 'Order', 'Details'] });
    expect(table.rows).toEqual([['1970-01-01T00:02:00.000Z', 'Order rejected', 'JRNL', 'local-paper:order:7', 'Insufficient virtual buying power to reserve this working order.']]);
    const hostile = paperJournalExportTable({ ...traded(), journal: [{ id: 1, at: 1, type: 'settings', message: '=HYPERLINK("x")' }] }, 'account');
    expect(toCsv(hostile.columns, hostile.rows)).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
